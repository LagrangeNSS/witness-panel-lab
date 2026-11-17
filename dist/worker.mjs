import {solve} from './engine.mjs';

self.onmessage=({data})=>{
  try {
    const result=solve(data.panel,{...data.options,progress:update=>self.postMessage(update)});
    self.postMessage({result});
  } catch (error) {
    self.postMessage({error:error.message});
  }
};
