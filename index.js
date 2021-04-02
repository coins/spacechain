const bitcoin = require('bitcoinjs-lib');
const bip68 = require('bip68')
const varuint = require('varuint-bitcoin');


const NETWORK = bitcoin.networks.testnet;



// const keyPair = bitcoin.ECPair.makeRandom({ network: NETWORK }); // generate a new key
const keyPair = bitcoin.ECPair.fromWIF('cTbo6uhXPQxhb8QmHzhZbCbdYb8Fmd3k5CEZaXxU5PTCKRGCBvEQ', NETWORK);

console.log('Covenant private key', keyPair.toWIF())

const locktime = bip68.encode({ blocks: 1 });

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

const covenant = bitcoin.payments.p2wsh({
    redeem: {
        output: script,
    },
    network: NETWORK,
});

console.log('Covenant Address', covenant.address);

const anyone_can_spend_script = bitcoin.script.fromASM(
    `
      OP_TRUE
    `
    .trim()
    .replace(/\s+/g, ' '),
);

const anyone_can_spend = bitcoin.payments.p2wsh({
    redeem: {
        output: anyone_can_spend_script,
    },
    network: NETWORK,
});



const getFinalScripts = (inputIndex, input, script) => {
    // Step 1: Check to make sure the meaningful locking script matches what you expect.
    const decompiled = bitcoin.script.decompile(script)

    // Step 2: Create final scripts
    let payment = bitcoin.payments.p2wsh({
        network: NETWORK,
        redeem: {
            output: script,
            input: bitcoin.script.compile([
                input.partialSig[0].signature,
            ]),
        },
    })

    function witnessStackToScriptWitness(witness) {
        let buffer = Buffer.allocUnsafe(0);

        function writeSlice(slice) {
            buffer = Buffer.concat([buffer, Buffer.from(slice)]);
        }

        function writeVarInt(i) {
            const currentLen = buffer.length;
            const varintLen = varuint.encodingLength(i);

            buffer = Buffer.concat([buffer, Buffer.allocUnsafe(varintLen)]);
            varuint.encode(i, buffer, currentLen);
        }

        function writeVarSlice(slice) {
            writeVarInt(slice.length);
            writeSlice(slice);
        }

        function writeVector(vector) {
            writeVarInt(vector.length);
            vector.forEach(writeVarSlice);
        }

        writeVector(witness);

        return buffer;
    }

    return {
        finalScriptSig: payment.input,
        finalScriptWitness: payment.witness && payment.witness.length > 0 ?
            witnessStackToScriptWitness(payment.witness) :
            undefined,
    };
}

const MIN_FEE = 166;
const MIN_OUTPUT_SIZE = 293;

// https://blockstream.info/testnet/api/tx/0be25af79189ed26ea6cc209fe0dc4f41d95fac333d1b7f6fa6291e1278ebe89/hex
let value = 89000;
let txid = 'a1a5b857295101c43cbcf41ffb4f20df531e85e53ff97daeb0278044956b5aeb'

while (value > MIN_OUTPUT_SIZE) {

    const psbt = new bitcoin.Psbt({ network: NETWORK })
        .setVersion(2)
        .addInput({
            hash: txid,
            index: 0,
            sequence: locktime,
            witnessUtxo: {
                script: covenant.output,
                value: value
            },
            witnessScript: covenant.redeem.output
        })
        .addOutput({
            address: covenant.address,
            value: value - MIN_OUTPUT_SIZE - MIN_FEE,
        })
        .addOutput({
            address: anyone_can_spend.address,
            value: MIN_OUTPUT_SIZE,
        })
        .signInput(0, keyPair)
        .finalizeInput(0, getFinalScripts)
        .extractTransaction()


    console.log(psbt.toHex())

    nonWitnessUtxo = Buffer.from(psbt.toHex(), 'hex')
    txid = psbt.getId()

    value -= MIN_OUTPUT_SIZE

    break // remove this to generate the chain of TX
}