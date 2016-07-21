import npmi from 'npmi';

const debug = require('debug')('IoTLogic:packageInstaller');

export default function packageInstaller(name) {
  // Try to resolve the packages, and install if it doesn't exists.
  let library;
  debug('Loading package ' + name);
  try {
    library = require(name);
    // Babel import / export support
    if (library.default) library = library.default;
  } catch (e) {
    // It doesn't exists! Try to install the package.
    return new Promise((resolve, reject) => {
      debug('Package missing; installing');
      console.log('Installing NPM package ' + name);
      npmi({ name: name }, (err) => {
        if (err) {
          debug('Installation failed: ' + err.stack);
          return reject(err);
        }
        try {
          debug('Package loaded; done');
          let library = require(name);
          // I hate Babel
          if (library.default) library = library.default;
          return resolve(library);
        } catch (e) {
          // Still, nope.
          debug('Loading failed: ' + e.stack);
          return reject(e);
        }
      });
    });
  }
  debug('Package loaded without any error');
  return Promise.resolve(library);
}
