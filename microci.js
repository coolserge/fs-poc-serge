// microci.js library

(function (global) {

    // Git operations module
    const gitOps = {
        // Check content of the root directory
        async checkContent(pfs) {
            try {
                const rootDirEntries = await pfs.readdir('/');
                const dirStats = await Promise.all(rootDirEntries.map(async entry => {
                    const stats = await pfs.stat(`/${entry}`);
                    return { entry, isDirectory: stats.isDirectory() };
                }));
                return dirStats.filter(({ isDirectory }) => isDirectory).map(({ entry }) => entry);
            } catch (err) {
                console.log('Error reading directories:', err);
                return [];
            }
        },

        // Delete contents of a directory
        async deleteDirectoryContents(pfs, path) {
            const entries = await pfs.readdir(path);
            await Promise.all(entries.map(async entry => {
                const fullPath = `${path}/${entry}`;
                const stats = await pfs.stat(fullPath);
                if (stats.isDirectory()) {
                    await this.deleteDirectoryContents(pfs, fullPath);
                    await pfs.rmdir(fullPath);
                } else {
                    await pfs.unlink(fullPath);
                }
            }));
        },

        // Fetch PGP key from URL
        async fetchPgpKey(pgpKeyUrl) {
            try {
                const response = await fetch(pgpKeyUrl);
                if (!response.ok) {
                    throw new Error('Failed to fetch PGP key');
                }
                return await response.text();
            } catch (error) {
                console.error('Error fetching PGP key:', error);
                return null;
            }
        },

        // Verify signature
        async verifySignature(data, armoredSignature, armoredPublicKey) {
            const publicKey = await openpgp.readKey({ armoredKey: armoredPublicKey });
            const signature = await openpgp.readSignature({ armoredSignature });
            const message = await openpgp.createMessage({ text: data });

            try {
                const verificationResult = await openpgp.verify({
                    message,
                    signature,
                    verificationKeys: publicKey
                });
                const { verified, keyID } = verificationResult.signatures[0];
                await verified;
                console.log(`Signature verified successfully with key ID ${keyID.toHex()}`);
                return true;
            } catch (e) {
                console.error(`Signature verification failed: ${e}`);
                return false;
            }
        },

        // Store public key in IndexedDB
        async storePublicKey(repoUrl, publicKey) {
            const encoder = new TextEncoder();
            const key = await crypto.subtle.digest('SHA-256', encoder.encode(repoUrl));
            const base64Key = btoa(String.fromCharCode.apply(null, new Uint8Array(key)));
            await idbKeyval.set(base64Key, publicKey);  // Using idbKeyval.set
        },

        // Get stored public key from IndexedDB
        async getStoredPublicKey(repoUrl) {
            const encoder = new TextEncoder();
            const key = await crypto.subtle.digest('SHA-256', encoder.encode(repoUrl));
            const base64Key = btoa(String.fromCharCode.apply(null, new Uint8Array(key)));
            return await idbKeyval.get(base64Key);  // Using idbKeyval.get
        },

        // Clone a repository, check out the latest commit as a detached HEAD and verify signatures
        async cloneRepo(fs, pfs, corsProxy, repoUrl, pgpKeyUrl) {
            const directoryPath = `/${repoUrl.split('/').pop().replace(/\.git$/, '')}`;

            try {
                const dirExists = await pfs.stat(directoryPath);
                await this.deleteDirectoryContents(pfs, directoryPath);
                await pfs.rmdir(directoryPath);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error("Error checking directory existence:", error);
                    throw new Error(`Error checking directory existence: ${error.message}`);
                }
            }

            try {
                // Clone the repository
                await git.clone({
                    fs,
                    http: GitHttp,
                    dir: directoryPath,
                    corsProxy: corsProxy,
                    url: repoUrl,
                    singleBranch: false,
                    depth: undefined,
                });

                // Fetch all branches and tags
                await git.fetch({
                    fs,
                    http: GitHttp,
                    dir: directoryPath,
                    corsProxy: corsProxy,
                    url: repoUrl,
                    singleBranch: false,
                    tags: true,
                });

                let branches = await git.listBranches({ fs, dir: directoryPath, remote: 'origin' });
                branches = branches.filter(branch => branch !== 'HEAD');

                let latestCommit = null;
                let latestTimestamp = 0;

                for (const branch of branches) {
                    await git.checkout({ fs, dir: directoryPath, ref: branch });
                    const commits = await git.log({ fs, dir: directoryPath, ref: branch });

                    for (const commit of commits) {
                        const data = commit.payload;
                        const armoredSignature = commit.commit.gpgsig;
                        if (!armoredSignature) {
                            await this.deleteDirectoryContents(pfs, directoryPath);
                            await pfs.rmdir(directoryPath);
                            throw new Error(`No signature found for commit ${commit.oid} in branch ${branch}. Repository is unverified and has been removed.`);
                        }

                        const armoredPublicKey = await this.fetchPgpKey(pgpKeyUrl);
                        if (armoredPublicKey && await this.verifySignature(data, armoredSignature, armoredPublicKey)) {
                            console.log(`Signature for commit ${commit.oid} in branch ${branch} is valid.`);

                            // Check if this commit is the latest
                            if (commit.commit.author.timestamp > latestTimestamp) {
                                latestTimestamp = commit.commit.author.timestamp;
                                latestCommit = commit;
                            }
                        } else {
                            await this.deleteDirectoryContents(pfs, directoryPath);
                            await pfs.rmdir(directoryPath);
                            throw new Error(`The signature for commit ${commit.oid} in branch ${branch} is invalid. Repository has been removed.`);
                        }
                    }
                }

                // Checkout the latest commit
                if (latestCommit) {
                    await git.checkout({
                        fs,
                        dir: directoryPath,
                        ref: latestCommit.oid
                    });
                    console.log(`Checked out latest commit: ${latestCommit.oid}`);
                } else {
                    console.warn("No valid commits found. Repository may be empty.");
                }

                const publicKey = await this.fetchPgpKey(pgpKeyUrl);
                await this.storePublicKey(repoUrl, publicKey);
                return { success: true, directoryPath, branches };
            } catch (error) {
                console.error("Cloning failed:", error);
                return { success: false, message: error.message };
            }
        },

        // Get current branch and commit
        async getCurrentBranchAndCommit(fs, pfs, directoryPath) {
            try {
                const headContent = await pfs.readFile(`${directoryPath}/.git/HEAD`, { encoding: 'utf8' });
                const trimmedContent = headContent.trim();

                if (trimmedContent.startsWith('ref: refs/heads/')) {
                    const branch = trimmedContent.replace('ref: refs/heads/', '');
                    const commit = await git.resolveRef({ fs, dir: directoryPath, ref: 'HEAD' });
                    return { branch, commit };
                } else {
                    // We're in detached HEAD state
                    return { branch: null, commit: trimmedContent };
                }
            } catch (error) {
                console.error('Error getting current branch and commit:', error);
                return { branch: null, commit: null };
            }
        },

        // List branches
        async listBranches(fs, directoryPath) {
            try {
                let branches = await git.listBranches({ fs, dir: directoryPath, remote: 'origin' });
                return branches.filter(branch => branch !== 'HEAD');
            } catch (error) {
                console.error('Error listing branches:', error);
                return [];
            }
        },

        // Get commits for a branch
        async getCommitsForBranch(fs, directoryPath, branch) {
            try {
                return await git.log({ fs, dir: directoryPath, ref: branch });
            } catch (error) {
                console.error(`Error getting commits for branch ${branch}:`, error);
                return [];
            }
        },

        // Checkout a commit
        async checkoutCommit(fs, pfs, directoryPath, branch, commit) {
            try {
                await git.checkout({ fs, dir: directoryPath, ref: branch });
                if (commit) {
                    await git.checkout({ fs, dir: directoryPath, ref: commit });
                }
                console.log(`Checked out commit ${commit} in branch ${branch}`);
            } catch (error) {
                console.error(`Error checking out commit ${commit} in branch ${branch}:`, error);
            }
        },

        // Delete a repository
        async deleteRepo(pfs, directoryPath) {
            try {
                if (directoryPath !== '/') {
                    await this.deleteDirectoryContents(pfs, directoryPath);
                    await pfs.rmdir(directoryPath);
                    console.log(`${directoryPath} directory deleted successfully.`);
                } else {
                    console.log('Cannot delete the root directory.');
                }
            } catch (err) {
                console.log(`Failed to delete ${directoryPath}.`, err);
            }
        },

        // List all directory contents for debugging
        async listAllDirectoryContents(pfs) {
            try {
                const rootDirEntries = await pfs.readdir('/');
                for (const entry of rootDirEntries) {
                    const stats = await pfs.stat(`/${entry}`);
                    if (stats.isDirectory()) {
                        const dirPath = `/${entry}`;
                        const dirContents = await pfs.readdir(dirPath);
                        console.log(`Contents of ${dirPath}:`, dirContents);
                    }
                }
            } catch (err) {
                console.error('Error listing directory contents:', err);
            }
        },

        // Fetch repository
        async fetchRepo(fs, pfs, corsProxy, directoryPath) {
            let logMessage = `Fetching repo in directory: ${directoryPath}\n`;
            let anyBranchUpdated = false;
            let anyNewCommits = false;
            try {
                const remotes = await git.listRemotes({ fs, dir: directoryPath });
                const originRemote = remotes.find(remote => remote.remote === 'origin');
                if (!originRemote) {
                    throw new Error('No origin remote found');
                }

                const publicKey = await this.getStoredPublicKey(originRemote.url);
                if (!publicKey) {
                    throw new Error('No stored public key found for this repository');
                }

                logMessage += 'Starting fetch operation...\n';
                await git.fetch({
                    fs,
                    http: GitHttp,
                    dir: directoryPath,
                    corsProxy: corsProxy,
                    url: originRemote.url,
                    singleBranch: false,
                    tags: true
                });
                logMessage += 'Fetch operation completed.\n';

                const localBranches = await git.listBranches({ fs, dir: directoryPath });
                logMessage += `Local branches: ${localBranches.join(', ')}\n`;

                for (const branch of localBranches) {
                    if (branch === 'HEAD') continue;

                    logMessage += `Checking branch: ${branch}\n`;

                    try {
                        const remoteCommit = await git.resolveRef({
                            fs,
                            dir: directoryPath,
                            ref: `refs/remotes/origin/${branch}`
                        });

                        const localCommit = await git.resolveRef({
                            fs,
                            dir: directoryPath,
                            ref: `refs/heads/${branch}`
                        });

                        if (remoteCommit === localCommit) {
                            logMessage += `  Branch ${branch} is up to date\n`;
                            continue;
                        }

                        anyNewCommits = true;

                        // Get all new commits
                        const newCommits = await git.log({
                            fs,
                            dir: directoryPath,
                            ref: remoteCommit,
                            depth: -1,
                            since: localCommit
                        });

                        let allCommitsValid = true;
                        for (const commit of newCommits) {
                            const { commit: commitObj, payload } = await git.readCommit({
                                fs,
                                dir: directoryPath,
                                oid: commit.oid
                            });

                            if (!commitObj.gpgsig) {
                                logMessage += `  Failed to update ${branch}: No signature found for commit ${commit.oid}\n`;
                                allCommitsValid = false;
                                break;
                            }

                            const isValid = await this.verifySignature(payload, commitObj.gpgsig, publicKey);
                            if (!isValid) {
                                logMessage += `  Failed to update ${branch}: Invalid signature for commit ${commit.oid}\n`;
                                allCommitsValid = false;
                                break;
                            }
                        }

                        if (allCommitsValid) {
                            await git.writeRef({
                                fs,
                                dir: directoryPath,
                                ref: `refs/heads/${branch}`,
                                value: remoteCommit,
                                force: true
                            });

                            anyBranchUpdated = true;
                            logMessage += `  Updated ${branch} to ${remoteCommit} (all signatures verified)\n`;
                        } else {
                            logMessage += `  Failed to update ${branch}: Some commits have missing or invalid signatures\n`;
                        }
                    } catch (branchError) {
                        logMessage += `  Failed to update ${branch}: ${branchError.message}\n`;
                    }
                }

                if (!anyNewCommits) {
                    logMessage += 'Fetch completed. Repository is already up to date.';
                } else if (anyBranchUpdated) {
                    logMessage += 'Repository fetched and some local branch references updated successfully';
                } else {
                    logMessage += 'Fetch completed, but no branches were updated due to missing or invalid signatures';
                }
                console.log(logMessage);
                return { success: anyBranchUpdated, upToDate: !anyNewCommits, log: logMessage };
            } catch (error) {
                logMessage += `Error fetching repository: ${error.message}`;
                console.error(logMessage);
                return { success: false, upToDate: false, message: error.message, log: logMessage };
            }
        },

        // Delete all repositories
        async deleteAllRepos(pfs) {
            const rootDirEntries = await pfs.readdir('/');
            for (const entry of rootDirEntries) {
                const stats = await pfs.stat(`/${entry}`);
                if (stats.isDirectory()) {
                    await this.deleteDirectoryContents(pfs, `/${entry}`);
                    await pfs.rmdir(`/${entry}`);
                }
            }
        }
    };

    // UI rendering module
    const renderUI = {
        async renderRepos(fs, pfs, corsProxy, messageDiv) {
            const directories = await gitOps.checkContent(pfs);
            const reposContainer = document.getElementById('reposContainer');
            reposContainer.innerHTML = '';

            const cloneControlPanel = document.getElementById('cloneControlPanel');
            cloneControlPanel.style.display = 'block';

            if (directories.length > 0) {
                for (const dir of directories) {
                    const directoryPath = `/${dir}`;
                    const dirEntries = await pfs.readdir(directoryPath);

                    if (dirEntries.length > 0) {
                        const repoContainer = this.createRepoContainer(dir, directoryPath);
                        const { branchSelect, commitSelect, fetchButton, deleteBtn } = this.createSelects(repoContainer);

                        const { branch: currentBranch, commit: currentCommit } = await gitOps.getCurrentBranchAndCommit(fs, pfs, directoryPath);
                        // Log the currently checked out commit
                        console.log(`Repository: ${dir}, Current Branch: ${currentBranch || 'detached HEAD'}, Current Commit: ${currentCommit}`);

                        await this.populateBranchSelect(fs, pfs, directoryPath, branchSelect, currentBranch);
                        await this.populateCommitSelect(fs, pfs, directoryPath, commitSelect, currentBranch || branchSelect.value, currentCommit);

                        // Set the correct commit in the dropdown
                        if (currentCommit) {
                            commitSelect.value = currentCommit;
                        }

                        this.setupEventListeners(fs, pfs, corsProxy, messageDiv, directoryPath, branchSelect, commitSelect, fetchButton, deleteBtn);
                        reposContainer.appendChild(repoContainer);

                        await this.updateContentDisplay(pfs, directoryPath);
                    }
                }
                document.getElementById('deleteAllRepos').style.display = 'block';
            } else {
                document.getElementById('deleteAllRepos').style.display = 'none';
            }
        },

        createRepoContainer(dir, directoryPath) {
            const repoContainer = document.createElement('div');
            repoContainer.classList.add('repo-container', 'mb-3');

            const contentDisplay = document.createElement('div');
            contentDisplay.dataset.directory = directoryPath;
            contentDisplay.innerHTML = `<h3>${dir}</h3>`;
            repoContainer.appendChild(contentDisplay);

            return repoContainer;
        },

        createSelects(repoContainer) {
            const branchSelect = document.createElement('select');
            branchSelect.classList.add('form-control', 'mb-2');
            repoContainer.appendChild(branchSelect);

            const commitSelect = document.createElement('select');
            commitSelect.classList.add('form-control', 'mb-2');
            repoContainer.appendChild(commitSelect);

            // Create a container for the buttons
            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('btn-group', 'mb-2');
            repoContainer.appendChild(buttonContainer);

            // Add fetch button
            const fetchButton = document.createElement('button');
            fetchButton.textContent = 'Fetch Repo';
            fetchButton.classList.add('btn', 'btn-info', 'mr-2');
            fetchButton.style.width = '120px'; // Set a fixed width
            buttonContainer.appendChild(fetchButton);

            // Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete Repo';
            deleteBtn.classList.add('btn', 'btn-danger');
            deleteBtn.style.width = '120px'; // Set the same fixed width
            buttonContainer.appendChild(deleteBtn);

            return { branchSelect, commitSelect, fetchButton, deleteBtn };
        },

        async populateBranchSelect(fs, pfs, directoryPath, branchSelect, currentBranch) {
            const branches = await gitOps.listBranches(fs, directoryPath);
            branchSelect.innerHTML = '';
            for (const branch of branches) {
                const branchOption = document.createElement('option');
                branchOption.value = branch;
                branchOption.textContent = branch;
                if (branch === currentBranch) {
                    branchOption.selected = true;
                }
                branchSelect.appendChild(branchOption);
            }
        },

        async populateCommitSelect(fs, pfs, directoryPath, commitSelect, branch, currentCommit) {
            const commits = await gitOps.getCommitsForBranch(fs, directoryPath, branch);
            commitSelect.innerHTML = '';
            for (const commit of commits) {
                const commitOption = document.createElement('option');
                commitOption.value = commit.oid;
                commitOption.textContent = `${commit.oid.slice(0, 7)} - ${commit.commit.message.split('\n')[0]}`;
                if (commit.oid === currentCommit) {
                    commitOption.selected = true;
                }
                commitSelect.appendChild(commitOption);
            }
        },

        setupEventListeners(fs, pfs, corsProxy, messageDiv, directoryPath, branchSelect, commitSelect, fetchButton, deleteBtn) {
            branchSelect.addEventListener('change', async () => {
                const currentCommit = commitSelect.value;
                await this.populateCommitSelect(fs, pfs, directoryPath, commitSelect, branchSelect.value);

                // Check if the current commit exists in the new branch
                const commitExists = Array.from(commitSelect.options).some(option => option.value === currentCommit);

                if (commitExists) {
                    commitSelect.value = currentCommit;
                } else {
                    // If the commit doesn't exist, checkout the latest commit of the new branch
                    await gitOps.checkoutCommit(fs, pfs, directoryPath, branchSelect.value, commitSelect.value);
                }

                await this.updateContentDisplay(pfs, directoryPath);
            });

            commitSelect.addEventListener('change', async () => {
                await gitOps.checkoutCommit(fs, pfs, directoryPath, branchSelect.value, commitSelect.value);
                await this.updateContentDisplay(pfs, directoryPath);
            });

            fetchButton.addEventListener('click', async () => {
                console.log('Fetch button clicked');
                const result = await gitOps.fetchRepo(fs, pfs, corsProxy, directoryPath);
                console.log('Fetch result:', result);
                if (result.upToDate) {
                    this.displayMessage(messageDiv, 'Repository is already up to date. No new commits to fetch.');
                } else if (result.success) {
                    // Refresh the UI
                    await this.populateBranchSelect(fs, pfs, directoryPath, branchSelect, branchSelect.value);
                    await this.populateCommitSelect(fs, pfs, directoryPath, commitSelect, branchSelect.value, commitSelect.value);
                    await this.updateContentDisplay(pfs, directoryPath);
                    // Display a success message
                    this.displayMessage(messageDiv, 'Repository fetched and some branches updated successfully');
                } else {
                    this.displayMessage(messageDiv, `Fetch completed, but no branches were updated: ${result.log}`);
                }
            });

            deleteBtn.addEventListener('click', async () => {
                await gitOps.deleteRepo(pfs, directoryPath);
                await this.renderRepos(fs, pfs, corsProxy, messageDiv);
            });
        },

        async updateContentDisplay(pfs, directoryPath) {
            const dirEntries = await pfs.readdir(directoryPath);
            const contentDisplay = document.querySelector(`[data-directory="${directoryPath}"]`);
            if (contentDisplay) {
                const repoName = directoryPath.slice(1);
                if (dirEntries.includes('index.html')) {
                    contentDisplay.innerHTML = `<h3>${repoName}</h3>Navigate to the cloned page <a href="${directoryPath}/index.html">here</a><br>`;
                } else {
                    contentDisplay.innerHTML = `<h3>${repoName}</h3>No index.html found in this directory.<br>`;
                }
            }
        },

        displayMessage(messageDiv, message) {
            messageDiv.innerHTML = message;
            messageDiv.style.display = message ? 'block' : 'none';
        }
    };

    // Expose the modules to the global scope
    global.GitUILibrary = {
        gitOps: gitOps,
        renderUI: renderUI
    };
})(typeof window !== 'undefined' ? window : global);