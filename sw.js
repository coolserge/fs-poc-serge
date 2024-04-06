importScripts(
    'https://cdn.jsdelivr.net/npm/@jcubic/wayne/index.umd.min.js',
    'https://cdn.jsdelivr.net/npm/idb-keyval/dist/umd.js',
    'https://cdn.jsdelivr.net/npm/@isomorphic-git/lightning-fs@4.6.0/dist/lightning-fs.min.js',
    'https://cdn.jsdelivr.net/gh/jcubic/static@master/js/path.js',
    'https://cdn.jsdelivr.net/gh/jcubic/static@master/js/mime.min.js'
);
const fs = new LightningFS('testfs');

const app = new wayne.Wayne();

const test = url => {
    console.log(url);
    if (url.hostname !== self.location.hostname) {
        return false;
    }
    const path = url.pathname;
    return !path.match(/admin|sw.js|newton.html|(^\/$)/) && !path.startsWith('/content');
};

const dir = async () => {
  const dir = await idbKeyval.get('__dir__');
  return dir ?? '/';
};

app.use(wayne.FileSystem({ path, fs, mime, dir, test }));

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
