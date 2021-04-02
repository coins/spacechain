const bitcoin = require('bitcoinjs-lib');
const bip68 = require('bip68')


const NETWORK = bitcoin.networks.testnet;

const MIN_OUTPUT_SIZE = 573;

// const keyPair = bitcoin.ECPair.makeRandom({ network: NETWORK });
const keyPair = bitcoin.ECPair.fromWIF('cTbo6uhXPQxhb8QmHzhZbCbdYb8Fmd3k5CEZaXxU5PTCKRGCBvEQ', NETWORK);

console.log('Covenant private key', keyPair.toWIF())

const locktime = bip68.encode({blocks: 1});

const script = bitcoin.script.fromASM(
    `
      ${bitcoin.script.number.encode( locktime ).toString('hex')}
      OP_CHECKSEQUENCEVERIFY
      OP_DROP
      ${keyPair.publicKey.toString('hex')}
      OP_CHECKSIG
    `
    .trim()
    .replace(/\s+/g, ' '),
);

const p2sh = bitcoin.payments.p2sh({
    redeem: {
        output: script,
    },
    network: NETWORK,
});

console.log('Covenant Address', p2sh.address);

const anyone_can_spend_script = bitcoin.script.fromASM(
    `
      OP_TRUE
    `
    .trim()
    .replace(/\s+/g, ' '),
);

const anyone_can_spend = bitcoin.payments.p2sh({
    redeem: {
        output: anyone_can_spend_script,
    },
    network: NETWORK,
});


console.log(p2sh.output)

const getFinalScripts = (inputIndex, input, script) => {
  // Step 1: Check to make sure the meaningful locking script matches what you expect.
  const decompiled = bitcoin.script.decompile(script)

  // Step 2: Create final scripts
  const payment = bitcoin.payments.p2sh({
    redeem: {
      output: script,
      input: bitcoin.script.compile([
        input.partialSig[0].signature,
      ]), 
    },
  })

  return {
    finalScriptSig: payment.input
  }
}

const MIN_FEE = 227

// https://blockstream.info/testnet/api/tx/0be25af79189ed26ea6cc209fe0dc4f41d95fac333d1b7f6fa6291e1278ebe89/hex
const utx = '02000000010fd4dd9c547bf5ed59fa00c5214b040fb1c5f6d47bd60cd399f89d646e4aa89c000000006f473044022017d016d73eb568575c8eb1638fc8120586e95313734b6029fd988f751b0a4f62022066d91f9b3c25393dda27f43c114574fed27d9d9035237eb0d92a61c55dfbc8fb012651b2752103fa61c62bb23f87319eab697eb0c837d9ec1924e96813b180df45bcd0a1b9f8f5ac0100000002885801000000000017a914d4afe12ddf92f721de09c8967d460c9f2fbac680873d0200000000000017a914da1745e9b549bd0bfa1a569971c77eba30cd5a4b8700000000';
let value = 88200;
let nonWitnessUtxo = Buffer.from(utx, 'hex');
let txid = '0be25af79189ed26ea6cc209fe0dc4f41d95fac333d1b7f6fa6291e1278ebe89'

while (value > MIN_OUTPUT_SIZE){

	const psbt = new bitcoin.Psbt({ network: NETWORK })
        .setVersion(2)
        .addInput({
          hash: txid,
          index: 0,
          sequence: locktime,
          nonWitnessUtxo,
          redeemScript : p2sh.redeem.output
        })
        .addOutput({
          address: p2sh.address,
          value: value - MIN_OUTPUT_SIZE,
        })
        .addOutput({
          address: anyone_can_spend.address,
          value: MIN_OUTPUT_SIZE,
        })
        .signInput(0, keyPair)
        .finalizeInput(0, getFinalScripts)
		.extractTransaction()
		

	console.log(psbt.toHex())	

	nonWitnessUtxo = Buffer.from( psbt.toHex() , 'hex') 
	txid = psbt.getId()

	value -= MIN_OUTPUT_SIZE
}

