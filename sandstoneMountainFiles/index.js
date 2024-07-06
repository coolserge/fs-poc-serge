'use strict'
const url = require('url');
const fs = require('fs'); // Import the filesystem module
const path = require('path'); // Import the path module
const pkg = require('./package.json');
const { send } = require('micro');
const origin = process.env.ALLOW_ORIGIN;
const insecure_origins = (process.env.INSECURE_HTTP_ORIGINS || '').split(',');
const middleware = require('./middleware.js')({ origin, insecure_origins });

async function service(req, res) {
  middleware(req, res, () => {
    let u = url.parse(req.url, true);
    if (u.pathname === '/') {
      const filePath = path.join(__dirname, 'navigation.html'); // Path to your HTML file
      fs.readFile(filePath, { encoding: 'utf-8' }, (err, html) => {
        if (err) {
          console.error(err);
          return send(res, 500, 'Internal Server Error');
        }
        res.setHeader('Content-Type', 'text/html');
        return send(res, 200, html);
      });
    } else if (u.pathname === '/secure-storage.html') {
      const filePath = path.join(__dirname, 'secure-storage.html'); // Path to your HTML file
      fs.readFile(filePath, { encoding: 'utf-8' }, (err, html) => {
        if (err) {
          console.error(err);
          return send(res, 500, 'Internal Server Error');
        }
        res.setHeader('Content-Type', 'text/html');
        return send(res, 200, html);
      }); 
    } else {
      // Don't waste my precious bandwidth
      return send(res, 403, '');
    }
  });
}

module.exports = service;

