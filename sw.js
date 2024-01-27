importScripts(
    'https://cdn.jsdelivr.net/npm/@jcubic/wayne/index.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@isomorphic-git/lightning-fs@4.6.0/dist/lightning-fs.min.js',
    'https://cdn.jsdelivr.net/gh/jcubic/static@master/js/path.js',
    'https://cdn.jsdelivr.net/gh/jcubic/static@master/js/mime.min.js'
);
const fs = new LightningFS('testfs');

const app = new wayne.Wayne();

const test = url => {
    if (url.host !== self.location.hostname) {
        return false;
    }
    const path = url.pathname;
    return !path.match(/admin|sw.js/) && !path.startsWith('/content');
};

let root = '/';

const dir = () => root;

self.addEventListener('message', ({ data }) => {
    root = data;
});

app.use(wayne.FileSystem({ path, fs, mime, dir, test }));

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
