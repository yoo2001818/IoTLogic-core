import npmi from 'npmi';
import path from 'path';

const debug = require('debug')('IoTLogic:packageInstaller');

export default function packageInstaller(name) {
  // Try to resolve the packages, and install if it doesn't exists.
  let library;
  let namePath = path.resolve(process.cwd(), 'node_modules', name);
  debug('Loading package ' + name);
  try {
    library = require(namePath);
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
          delete require.cache[require.resolve(namePath)];
          let library = require(namePath);
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
