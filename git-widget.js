class GitWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.fs = null;
        this.pfs = null;
        this.corsProxy = 'https://microci.com';
        this.pgpKeyUrl = 'https://gist.githubusercontent.com/coolserge/bd305bd73260b61d06954e7c2a982655/raw/ea467d6644fd848ba355640e7714f89734db9da2/file.pgp';
    }

    async connectedCallback() {
        await this.loadScripts();
        this.render();
        await this.initialize();
    }

    async loadScripts() {
        const scripts = [
            'https://cdn.jsdelivr.net/npm/@isomorphic-git/lightning-fs/dist/lightning-fs.min.js',
            'https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.0/index.umd.min.js',
            'https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.0/http/web/index.umd.js',
            'https://cdn.jsdelivr.net/npm/idb-keyval/dist/umd.js',
            'https://cdn.jsdelivr.net/npm/openpgp@5.11.2/dist/openpgp.min.js',
            'https://cdn.jsdelivr.net/gh/coolserge/fs-poc-serge@microciLibrary/microci.js'
        ];

        for (const src of scripts) {
            await this.loadScript(src);
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    render() {
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/css/bootstrap.min.css');
            :host {
                display: block;
                font-family: Arial, sans-serif;
            }
            .repo-container {
                border: 1px solid #ccc;
                border-radius: 5px;
                padding: 10px;
                margin-bottom: 10px;
            }
        `;
        this.shadowRoot.appendChild(style);

        const container = this.createElement('div', { class: 'container mt-5' });
        
        const title = this.createElement('h1', { class: 'mb-3' }, 'Git Operations');
        container.appendChild(title);

        const cloneControlPanel = this.createElement('div', { id: 'cloneControlPanel', class: 'mb-3' });
        const repoForm = this.createElement('form', { id: 'repoForm' });
        const formRow = this.createElement('div', { class: 'form-row align-items-center' });
        const inputCol = this.createElement('div', { class: 'col-12 col-md-6' });
        const repoUrlInput = this.createElement('input', { type: 'url', class: 'form-control mb-2', id: 'repoUrl', placeholder: 'Enter repository URL', required: true });
        inputCol.appendChild(repoUrlInput);
        formRow.appendChild(inputCol);
        const buttonCol = this.createElement('div', { class: 'col-12 col-md-6' });
        const cloneButton = this.createElement('button', { type: 'submit', class: 'btn btn-primary mb-2' }, 'Clone Repo');
        buttonCol.appendChild(cloneButton);
        formRow.appendChild(buttonCol);
        repoForm.appendChild(formRow);
        cloneControlPanel.appendChild(repoForm);
        container.appendChild(cloneControlPanel);

        const displayMessage = this.createElement('div', { id: 'displayMessage', class: 'alert alert-warning', role: 'alert', style: 'display: none;' });
        container.appendChild(displayMessage);

        const reposContainer = this.createElement('div', { id: 'reposContainer', class: 'mt-3' });
        container.appendChild(reposContainer);

        const deleteAllRepos = this.createElement('div', { id: 'deleteAllRepos', class: 'mt-3 mb-3', style: 'display: none;' });
        const deleteAllButton = this.createElement('button', { id: 'deleteAllButton', class: 'btn btn-danger' }, 'Delete All Repos');
        deleteAllRepos.appendChild(deleteAllButton);
        container.appendChild(deleteAllRepos);

        this.shadowRoot.appendChild(container);
    }

    createElement(tag, attributes = {}, textContent = '') {
        const element = document.createElement(tag);
        for (const [key, value] of Object.entries(attributes)) {
            element.setAttribute(key, value);
        }
        if (textContent) {
            element.textContent = textContent;
        }
        return element;
    }

    async initialize() {
        this.fs = new LightningFS('testfs');
        this.pfs = this.fs.promises;
        this.messageDiv = this.shadowRoot.getElementById('displayMessage');

        this.shadowRoot.getElementById('repoForm').addEventListener('submit', (event) => this.handleCloneRepo(event));
        this.shadowRoot.getElementById('deleteAllButton').addEventListener('click', () => this.handleDeleteAllRepos());

        await GitUILibrary.gitOps.checkContent(this.pfs);
        await this.renderRepos();
    }

    async renderRepos() {
        const reposContainer = this.shadowRoot.getElementById('reposContainer');
        reposContainer.innerHTML = '';

        const repos = await GitUILibrary.gitOps.checkContent(this.pfs);

        if (repos.length === 0) {
            reposContainer.appendChild(this.createElement('p', {}, 'No repositories cloned yet.'));
            this.shadowRoot.getElementById('deleteAllRepos').style.display = 'none';
        } else {
            for (const repo of repos) {
                const repoElement = this.createElement('div', { class: 'repo-container mb-3' });
                
                const row = this.createElement('div', { class: 'row align-items-center' });
                
                const nameCol = this.createElement('div', { class: 'col-md-3' });
                nameCol.appendChild(this.createElement('h3', { class: 'mb-0' }, repo));
                row.appendChild(nameCol);

                const linkCol = this.createElement('div', { class: 'col-md-3' });
                const repoLink = this.createElement('a', { href: `/${repo}/index.html`, target: '_blank' }, 'View Repository');
                linkCol.appendChild(repoLink);
                row.appendChild(linkCol);

                const branchCol = this.createElement('div', { class: 'col-md-2' });
                const branchSelect = this.createElement('select', { class: 'form-control branch-select' });
                branchCol.appendChild(branchSelect);
                row.appendChild(branchCol);

                const commitCol = this.createElement('div', { class: 'col-md-2' });
                const commitSelect = this.createElement('select', { class: 'form-control commit-select' });
                commitCol.appendChild(commitSelect);
                row.appendChild(commitCol);

                const buttonCol = this.createElement('div', { class: 'col-md-2' });
                const fetchButton = this.createElement('button', { class: 'btn btn-info mr-2' }, 'Fetch');
                fetchButton.addEventListener('click', () => this.fetchRepo(repo));
                buttonCol.appendChild(fetchButton);

                const deleteButton = this.createElement('button', { class: 'btn btn-danger' }, 'Delete');
                deleteButton.addEventListener('click', () => this.deleteRepo(repo));
                buttonCol.appendChild(deleteButton);
                row.appendChild(buttonCol);

                repoElement.appendChild(row);
                reposContainer.appendChild(repoElement);

                await this.populateBranchSelect(repo, branchSelect);
                await this.populateCommitSelect(repo, branchSelect.value, commitSelect);

                branchSelect.addEventListener('change', () => this.handleBranchChange(repo, branchSelect, commitSelect));
                commitSelect.addEventListener('change', () => this.handleCommitChange(repo, branchSelect, commitSelect));
            }
            this.shadowRoot.getElementById('deleteAllRepos').style.display = 'block';
        }
    }

    async populateBranchSelect(repo, branchSelect) {
        const branches = await GitUILibrary.gitOps.listBranches(this.fs, `/${repo}`);
        branchSelect.innerHTML = '';
        for (const branch of branches) {
            const option = this.createElement('option', { value: branch }, branch);
            branchSelect.appendChild(option);
        }
    }

    async populateCommitSelect(repo, branch, commitSelect) {
        const commits = await GitUILibrary.gitOps.getCommitsForBranch(this.fs, `/${repo}`, branch);
        commitSelect.innerHTML = '';
        for (const commit of commits) {
            const option = this.createElement('option', { value: commit.oid }, `${commit.oid.slice(0, 7)} - ${commit.commit.message.split('\n')[0]}`);
            commitSelect.appendChild(option);
        }
    }

    async handleBranchChange(repo, branchSelect, commitSelect) {
        await this.populateCommitSelect(repo, branchSelect.value, commitSelect);
        await GitUILibrary.gitOps.checkoutCommit(this.fs, this.pfs, `/${repo}`, branchSelect.value, commitSelect.value);
    }

    async handleCommitChange(repo, branchSelect, commitSelect) {
        await GitUILibrary.gitOps.checkoutCommit(this.fs, this.pfs, `/${repo}`, branchSelect.value, commitSelect.value);
    }

    displayMessage(message) {
        this.messageDiv.textContent = message;
        this.messageDiv.style.display = message ? 'block' : 'none';
    }

    async handleCloneRepo(event) {
        event.preventDefault();
        const repoUrl = this.shadowRoot.getElementById('repoUrl').value;
        if (repoUrl) {
            this.displayMessage('');
            const result = await GitUILibrary.gitOps.cloneRepo(this.fs, this.pfs, this.corsProxy, repoUrl, this.pgpKeyUrl);
            if (result.success) {
                await this.renderRepos();
                console.log("Listing all directory contents:");
                await GitUILibrary.gitOps.listAllDirectoryContents(this.pfs);
            } else {
                this.displayMessage(result.message);
            }
        } else {
            this.displayMessage('Please fill in the repository URL.');
        }
    }

    async fetchRepo(repoName) {
        this.displayMessage(`Fetching updates for ${repoName}...`);
        try {
            const result = await GitUILibrary.gitOps.fetchRepo(this.fs, this.pfs, this.corsProxy, `/${repoName}`);
            console.log('Fetch result:', result);  // Log the full result for debugging

            if (result.upToDate) {
                this.displayMessage(`Repository ${repoName} is already up to date. No new commits to fetch.`);
            } else if (result.success) {
                this.displayMessage(`${repoName} updated successfully. ${result.log}`);
                await this.renderRepos();
            } else {
                this.displayMessage(`Fetch completed, but no branches were updated: ${result.log || result.message}`);
            }
        } catch (error) {
            console.error('Fetch error:', error);  // Log the full error for debugging
            this.displayMessage(`Error fetching ${repoName}: ${error.message}`);
        }
    }

    async deleteRepo(repoName) {
        await GitUILibrary.gitOps.deleteRepo(this.pfs, `/${repoName}`);
        await this.renderRepos();
    }

    async handleDeleteAllRepos() {
        await GitUILibrary.gitOps.deleteAllRepos(this.pfs);
        await this.renderRepos();
    }
}

customElements.define('git-widget', GitWidget);