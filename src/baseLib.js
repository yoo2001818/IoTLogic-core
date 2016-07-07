import { NativeProcedureValue, PairValue, SymbolValue } from 'r6rs';

import schemeCode from './baseLib.scm';

export default [
  new NativeProcedureValue('device-list', (list, machine) => {
    // This can be a little slow; we can cache the pairs I suppose.
    // Should it be a symbol or a string? Since symbol can be easily compared
    // by eq? in Scheme, we should use symbols.
    let clientList = PairValue.fromArray(
      machine.iotLogicEnv.clientList.map(v => new SymbolValue(v.name))
    );
    return clientList;
  }, []),
  schemeCode
];
