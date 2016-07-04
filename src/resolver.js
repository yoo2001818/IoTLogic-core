import { DefaultResolver } from 'r6rs-async-io';

// Resolver that considers device name... This actually creates no-op for
// different device names.
export default class Resolver extends DefaultResolver {
  constructor(name, directives) {
    super(directives);
    this.name = name;
  }
  resolve(keyword) {
    // TODO We have to handle nonexistent directives, since we have to send
    // other nodes 'not exist' error.
    if (keyword.indexOf(':') === -1) return this.directives[keyword];
    let [deviceName, commandName] = keyword.split(':');
    if (deviceName !== this.name) {
      // TODO Create no-op
      return false;
    }
    return this.directives[commandName];
  }
}
