process.env.CHROME_BIN = process.env.CHROME_BIN || require('puppeteer').executablePath();
const path = require('path');
const fs = require('fs');

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular/build/private'),
      {
        'middleware:assets-middleware': ['factory', function() {
          return function(req, res, next) {
            if (req.url.startsWith('/assets/')) {
              const filePath = path.join(__dirname, 'src', req.url);
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath);
                const ext = path.extname(filePath).toLowerCase();
                const mimeTypes = {
                  '.txt': 'text/plain',
                  '.csv': 'text/csv',
                  '.tsv': 'text/tab-separated-values',
                  '.json': 'application/json',
                  '.png': 'image/png',
                  '.jpg': 'image/jpeg',
                  '.svg': 'image/svg+xml'
                };
                res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
                res.end(content);
                return;
              }
            }
            next();
          };
        }]
      }
    ],
    middleware: ['assets-middleware'],
    client: {
      jasmine: {
        timeoutInterval: 300000
      },
      clearContext: false
    },
    jasmineHtmlReporter: {
      suppressAll: true
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' }
      ]
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadless'],
    browserNoActivityTimeout: 300000,
    browserDisconnectTimeout: 300000,
    browserDisconnectTolerance: 3,
    captureTimeout: 300000,
    restartOnFileChange: true
  });
};
