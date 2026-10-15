// Minimal compatibility repro only. Pi's /node adapter is documented as Node-specific.
console.log(`Bun ${Bun.version}; pi-durable 1.2.0`);
try {await import('@earendil-works/pi-durable/storage/sqlite/node');console.log('Node adapter imported; re-evaluate compatibility on this Bun version.');}
catch(error){console.log(error.message);}
