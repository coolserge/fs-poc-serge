importScripts(
  'https://cdn.jsdelivr.net/gh/jcubic/wayne/index.umd.js',
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
  return !path.match(/admin|sw.js|microci.js|(^\/$)/) && !path.startsWith('/content');
};

const dir = async () => {
  const dir = await idbKeyval.get('__dir__');
  return dir ?? '/';
};

app.use(wayne.FileSystem({ path, fs, mime, dir, test }));

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

const origins = ['https://upload.wikimedia.org', 'http://localhost', 'https://www.microcitest.info', 'https://microcitest.info','https://microci.com','https://cdn.jsdelivr.net', 'https://gist.githubusercontent.com','https://stackpath.bootstrapcdn.com'];
//const origins = ['http://localhost', 'https://cdn.jsdelivr.net'];
//const origins = ['https://cdn.jsdelivr.net'];

app.get('https://*/*', (req, res) => {
  const url = new URL(req.url);
  if (url.origin.match(/chrome-extension/) ||
      origins.includes(url.origin)) {
      res.fetch(req);
  } else {
      res.json({error: 'Forbidden'}, { status: 403 });
  }
});