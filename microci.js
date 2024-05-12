// microci.js

(function (global) {
    // Definitions of all the functions and variables
    const fs = new LightningFS('testfs');
    const pfs = fs.promises;
    const corsProxy = 'https://sandstonemountain.com';
    const armoredPublicKey = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mQENBGX19UcBCACobhXY5SVtc+fM8j/XrMhEfikazwbjHcb0ErNwA1SaFhqlvntt
6HJ5zbPu0JmtYqgI1h4gCsYPtr0ZQfcPO3xpG35WFe4DAcvqoZYUmRD/RuNabjvq
soXt5wJoo7SUh7deXWWv1/EcKQ5YbJWkQ9+8PnuTnfty1ZNyDE/7ygxq1Eml9XhQ
799sLks17OnFdY4ZtD1HvFrwN9Ri9K2sJG4zuEURcfG0CRnePr3hAPREgQS6y0eT
6ioFb01SM3iJzIqhGaKPV/Q2pHI1WE+Fd4oMcKH1PpABLoIcEyDJyneAb4rcedoN
p0pvhMesqpFX3jhczW/PXS1ZbiyiUTUPLDgvABEBAAG0MlNlcmdlIFNpbW9ub3Yg
KE15IDIwNDggUEdQIGtleSkgPHNlcmdlZUBnbWFpbC5jb20+iQFOBBMBCgA4FiEE
cIaaxqRAv96GV4a+J2bfNv9VIjEFAmX19UcCGwMFCwkIBwIGFQoJCAsCBBYCAwEC
HgECF4AACgkQJ2bfNv9VIjEuVgf9EGatR5AP7ySFdPcTDDtYtg5RaDHZe3g8gRUe
hgZ8VN74JrQbO82gPZZpvjIjXJe8aIr6QdPb5z9rQNsvhTW4TJGyxvWp475hEMQC
Ve9s9QXj/A+iX2e4KLf+A0MANStC+QnMIV+ZqcIjB9OvmvyIfMyfha4RHtTuMKlP
uwyXMbZdeVSExyQr4v07astdGQVuQQHKXrJG0T4x03YiNv7n9m+drepviebjZ9u7
ZJvf0u1XfZoXj7+eX5rMfP+xq9Y42lflBc+ervgIFS0d9M7aOQrYU6LEif2eO6tt
BMrN91PE9DdpirOrFjLy5z/U4vyaMSp0VIc/ftu79gu3q6zQ2bkBDQRl9fVHAQgA
13T7ChjYeQVMtUfOzbgHQzPBbpdFgmy6fizKEc8lV47c+VTpuXGjdh3NCbIAyuOJ
r0mqnWd/A6aD+CxXtlT/4RT5/MP1P8FGPQ1E1goBjjzlwl7JK2VAGJbZ2CpyysVI
SpyjDD/D/J7hQ5Ps6kNYRIoLjFceablClmgVLKIlppx/jtZnQiGTFvFq0y2Phseq
9FkTD4G10Cq6ps1FZz1j5uqWef3ESSaCUo2cJ5Q+q6lURf8g+StWM75XHmbjqxx8
wL83Pn5T/IKUXOhgAs/DBADQh9lJZjLZXy+//q/+MAVws9e7O22S6H7wCN1BWa1P
fvfwR9j3lBEDUS0wyedS7QARAQABiQE2BBgBCgAgFiEEcIaaxqRAv96GV4a+J2bf
Nv9VIjEFAmX19UcCGwwACgkQJ2bfNv9VIjEYZwf+Jz5go04WvNjyvCb1Ni/bZ5cE
72cPiLY+I5m60t1JhG/FBH/vgKyjYWXe1YUs9ZFI6+MeQIaIZAgU4p1E9o0iX1N2
woTsohkGualR0c3bGb+9ve77LWC/6EbqdbMEMpoPHCSJ8W7ZCGRQ2du6G3Gt6PNu
4yzc09JtI0Uwe7aaN4Bslx1cwoI0d2vigOMfqtL0eGIRP633uqklmcrVWKH73Ypc
GosoXUVVq4/BAkFgKUaBGQ/Y57CHWTmEeguJrr0F5LrFM3VOs1UuCTKNtCOtDMvJ
6Dd5ss1xcYlKxzd3DfSIVOvilqk3KAnZIDz7k8T7ImSaElOeDJXs36u/723qpg==
=Q0Tf
-----END PGP PUBLIC KEY BLOCK-----`;

    // Updated function to check and display content for all directories under /
    async function checkAndDisplayContent() {
        try {
            const rootDirEntries = await pfs.readdir('/');
            const dirStatPromises = rootDirEntries.map(async entry => {
                const stats = await pfs.stat(`/${entry}`);
                return { entry, isDirectory: stats.isDirectory() };
            });
            const dirStats = await Promise.all(dirStatPromises);
            const directories = dirStats.filter(({ isDirectory }) => isDirectory).map(({ entry }) => entry);
            console.log(directories);

            const reposContainer = document.getElementById('reposContainer');
            reposContainer.innerHTML = ''; // Clear existing content

            const cloneControlPanel = document.getElementById('cloneControlPanel');
            cloneControlPanel.style.display = 'block'; // Always show the cloneControlPanel

            if (directories.length > 0) {
                for (const dir of directories) {
                    let directoryPath = `/${dir}`;
                    const dirEntries = await pfs.readdir(directoryPath);

                    if (dirEntries.length > 0) {
                        const repoContainer = document.createElement('div');
                        repoContainer.classList.add('repo-container', 'mb-3');
                        reposContainer.appendChild(repoContainer);

                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = 'Delete Repo';
                        deleteBtn.classList.add('btn', 'btn-danger', 'mb-2');
                        deleteBtn.addEventListener('click', async () => {
                            await deleteRepo(directoryPath, repoContainer);
                        });
                        repoContainer.appendChild(deleteBtn);

                        const contentDisplay = document.createElement('div');
                        if (dirEntries.includes('index.html')) {
                            contentDisplay.innerHTML = `<h3>${dir}</h3>Navigate to the cloned page <a href="${directoryPath}/index.html">here</a><br>`;
                        } else {
                            contentDisplay.innerHTML = `<h3>${dir}</h3>No index.html found in this directory.<br>`;
                        }
                        repoContainer.appendChild(contentDisplay);

                        reposContainer.appendChild(repoContainer);
                    }
                }
                document.getElementById('deleteAllRepos').style.display = 'block'; // Show the deleteAllRepos button
            } else { // Hide the deleteAllRepos button if there are no directories
                document.getElementById('deleteAllRepos').style.display = 'none';
            }
        } catch (err) {
            console.log('Error reading directories:', err);
        }
    }

    //Delete all repos function
    async function deleteAllRepos() {
        const rootDirEntries = await pfs.readdir('/');
        for (const entry of rootDirEntries) {
            const stats = await pfs.stat(`/${entry}`);
            if (stats.isDirectory()) {
                await deleteDirectoryContents(`/${entry}`);
                await pfs.rmdir(`/${entry}`);
            }
        }
        checkAndDisplayContent(); // Refresh the display to reflect changes
    }

    // Updated function to recursively delete all files and directories within a given path
    async function deleteDirectoryContents(path) {
        const entries = await pfs.readdir(path);
        await Promise.all(entries.map(async (entry) => {
            const fullPath = `${path}/${entry}`;
            const stats = await pfs.stat(fullPath);
            if (stats.isDirectory()) {
                await deleteDirectoryContents(fullPath); // Recurse into subdirectory
                await pfs.rmdir(fullPath); // Remove the now-empty subdirectory
            } else {
                await pfs.unlink(fullPath); // Delete file
            }
        }));
    }

    // Updated function to delete cloned directory and clear the content display
    async function deleteRepo(directoryPath, repoContainer) {
        try {
            if (directoryPath !== '/') {
                await deleteDirectoryContents(directoryPath);
                await pfs.rmdir(directoryPath);
                console.log(`${directoryPath} directory deleted successfully.`);
                repoContainer.remove(); // Remove the repository container
            } else {
                console.log('Cannot delete the root directory.');
            }
        } catch (err) {
            console.log(`Failed to delete ${directoryPath}.`, err);
        }
        checkAndDisplayContent(); // Call checkAndDisplayContent to update the UI
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => {
                    reg.addEventListener('updatefound', () => {
                        const installingWorker = reg.installing;
                        console.log('A new service worker is being installed:', installingWorker);
                    });
                    console.log('Registration succeeded. Scope is ' + reg.scope);
                })
                .catch(error => {
                    console.log('Registration failed with ' + error);
                });
        } else {
            console.log('Service workers are not supported in this browser.');
        }
    }

    // Updated cloneRepo function
    async function cloneRepo(repoUrl, corsProxyArg = corsProxy, armoredPublicKeyArg = armoredPublicKey) {
        const directoryPath = `/${repoUrl.split('/').pop().replace(/\.git$/, '')}`;

        // Check if the directory already exists
        try {
            const dirExists = await pfs.stat(directoryPath);
            console.log(`${directoryPath} exists. Deleting old contents.`);
            await deleteDirectoryContents(directoryPath);
            await pfs.rmdir(directoryPath);
            console.log("Old directory contents were overwritten.");
            checkAndDisplayContent(); // Update the UI to reflect the deletion
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error("Error checking directory existence:", error);
                return; // Stops further execution if the error is not about the non-existence of the directory
            } else {
                console.log("Directory does not exist, no need to delete.");
            }
        }

        // Proceed with cloning
        try {
            await git.clone({
                fs,
                http: GitHttp,
                dir: directoryPath,
                corsProxy: corsProxy,
                url: repoUrl,
                singleBranch: true,
                depth: 1
            });

            const commitObject = await loadClonedCommitObject(directoryPath);
            if (commitObject) {
                const data = commitObject.payload;
                const armoredSignature = commitObject.commit.gpgsig;

                if (!armoredSignature) {
                    await deleteDirectoryContents(directoryPath);
                    await pfs.rmdir(directoryPath);
                    console.log("No signature found. Repository is unverified and has been removed.");
                    return;
                }

                const isValid = await verifySignature(data, armoredSignature, armoredPublicKey);
                if (isValid) {
                    console.log('Signature is valid. Updating the UI.');
                    const repoContainer = document.createElement('div');
                    repoContainer.classList.add('repo-container', 'mb-3');

                    const contentDisplay = document.createElement('div');
                    const directoryContents = await pfs.readdir(directoryPath);
                    if (directoryContents.includes('index.html')) {
                        contentDisplay.innerHTML = `<h3>${directoryPath.slice(1)}</h3>Signature is valid. <br> Navigate to the cloned page <a href="${directoryPath}/index.html">here</a>.<br>`;
                    } else {
                        contentDisplay.innerHTML = `<h3>${directoryPath.slice(1)}</h3>Signature is valid. No index.html found in the cloned repo.<br>`;
                    }

                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = 'Delete Repo';
                    deleteBtn.classList.add('btn', 'btn-danger', 'mb-2');
                    deleteBtn.addEventListener('click', async () => {
                        await deleteRepo(directoryPath, repoContainer);
                    });

                    repoContainer.appendChild(deleteBtn);
                    repoContainer.appendChild(contentDisplay);

                    const reposContainer = document.getElementById('reposContainer');
                    reposContainer.appendChild(repoContainer);
                    document.getElementById('deleteAllRepos').style.display = 'block'; // Show the deleteAllRepos button
                } else {
                    await deleteDirectoryContents(directoryPath);
                    await pfs.rmdir(directoryPath);
                    console.log("The signature is invalid or does not match the provided public key. The repository has been removed.");
                }
            } else {
                await deleteDirectoryContents(directoryPath);
                await pfs.rmdir(directoryPath);
                console.log("No commit object found. Repository is unverified and has been removed.");
            }
        } catch (error) {
            console.error("Cloning failed:", error);
            await deleteDirectoryContents(directoryPath);
            await pfs.rmdir(directoryPath);
            console.log("Failed directory was removed.");
        }
    }


    // End of cloneRepo function

    // Adjusted function to return the commit object instead of stringifying it
    async function loadClonedCommitObject(directoryPath) {
        try {
            const commits = await git.log({
                fs,
                dir: directoryPath, // Use directoryPath instead of a hardcoded value
                depth: 1,
            });
            if (commits.length > 0) {
                return commits[0]; // Return the commit object directly
            } else {
                console.log('No commits found.');
                return null;
            }
        } catch (error) {
            console.error('Error loading commit object:', error);
            return null;
        }
    }


    async function verifySignature(data, armoredSignature, armoredPublicKey) {
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
            await verified; // This will reject if the signature is invalid
            console.log(`Signature verified successfully with key ID ${keyID.toHex()}`);
            return true;
        } catch (e) {
            console.error(`Signature verification failed: ${e}`);
            return false;
        }
    }


    // Export functions to the global object
    global.MicroCI = {
        registerServiceWorker,
        cloneRepo,
        checkAndDisplayContent,
        deleteAllRepos,
        deleteRepo
    };
})(window);
