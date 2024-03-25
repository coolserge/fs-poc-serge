// Function to check if the cloned directory exists and display content if it does
async function checkAndDisplayContent(directoryPath, contentDisplayId) {
    try {
        const stats = await pfs.stat(directoryPath);
        if (stats.isDirectory()) {
            const entries = await pfs.readdir(directoryPath);
            if (entries.length > 0) {
                document.getElementById('deleteBtn').style.display = 'inline';
                if (entries.includes('index.html')) {
                    document.getElementById(contentDisplayId).innerHTML = `Navigate to the cloned page <a href="${directoryPath}/index.html">here</a>`;
                } else {
                    document.getElementById(contentDisplayId).innerHTML = 'No index.html found in the cloned repo.';
                }
            } else {
                document.getElementById('cloneBtn').style.display = 'inline';
            }
        } else {
            document.getElementById('cloneBtn').style.display = 'inline';
        }
    } catch (err) {
        document.getElementById('cloneBtn').style.display = 'inline';
        console.log(`${directoryPath} directory does not exist.`);
    }
}

// Function to recursively delete all files and directories within a given path
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
async function deleteRepo(directoryPath, contentDisplayId) {
    try {
        // Use directoryPath instead of hardcoded '/foo'
        await deleteDirectoryContents(directoryPath);
        await pfs.rmdir(directoryPath); //now remove the empty directory
        console.log(`${directoryPath} directory deleted successfully.`);
        document.getElementById(contentDisplayId).innerHTML = ''; // Clear the display content
        // Toggle button visibility
        document.getElementById('deleteBtn').style.display = 'none';
        document.getElementById('cloneBtn').style.display = 'inline';
    } catch (err) {
        console.log(`Failed to delete ${directoryPath}.`, err);
    }
}

//service worker registration
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

// Clone function
async function cloneRepo(repoUrl, directoryPath, contentDisplayId, corsProxy, armoredPublicKey) {
    try {
        await git.clone({
            fs,
            http: GitHttp,
            dir: directoryPath, // Use directoryPath argument
            corsProxy: corsProxy, // Added our proxy server
            url: repoUrl, // Use repoUrl argument
            singleBranch: true,
            depth: 1
        });
        const commitObject = await loadClonedCommitObject(directoryPath); // Load commit signature
        console.log(commitObject); // Debugging
        // Assuming the payload and signature are being set for verification
        if (commitObject) {

            const data = commitObject.payload; // Directly use the payload from commitObject
            const armoredSignature = commitObject.commit.gpgsig; // Directly use the gpgsig from commitObject

            // Check for the existence of a signature

            if (!armoredSignature) {
                // Handle missing signature
                await deleteDirectoryContents(directoryPath);
                document.getElementById(contentDisplayId).innerHTML = "No signature found. Repository is unverified and has been removed.";
                return; // Exit function to avoid further execution
            }

            // Perform the signature verification
            const isValid = await verifySignature(data, armoredSignature, armoredPublicKey);
            if (isValid) {
                // Signature is valid, update content and button display
                // After cloning, check for the existence of index.html
                const directoryContents = await pfs.readdir(directoryPath);
                if (directoryContents.includes('index.html')) {
                    document.getElementById(contentDisplayId).innerHTML = `Signature is valid. <br> Navigate to the cloned page <a href="${directoryPath}/index.html">here</a>.`;
                } else {
                    document.getElementById(contentDisplayId).innerHTML = 'Signature is valid. No index.html found in the cloned repo.';
                }
                document.getElementById('deleteBtn').style.display = 'inline'; // Display the delete button
                document.getElementById('cloneBtn').style.display = 'none'; // Hide the clone button
            } else {
                // Signature is invalid or does not match
                await deleteDirectoryContents(directoryPath); // Optionally delete the repo
                document.getElementById(contentDisplayId).innerHTML = "The signature is invalid or does not match the provided public key. The repository has been removed.";
                document.getElementById('deleteBtn').style.display = 'none'; // Hide the delete button
            }

        } else {
            await deleteDirectoryContents(directoryPath); // Delete repo due to missing signature
            document.getElementById('deleteBtn').style.display = 'none'; // No need to display delete button
            document.getElementById(contentDisplayId).innerHTML = "No signature found. Repository is unverified and has been removed.";
        }
    } catch (error) {
        console.error("Cloning failed:", error);
        document.getElementById(contentDisplayId).textContent = 'Failed to clone repository.';
    } finally {

    }
} // End of cloneRepo function

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