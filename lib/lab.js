"use strict";

const {RPC} = require("ckb-js-toolkit");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {sealTransaction} = require("@ckb-lumos/helpers");
const lib = require("../lib/index.js");
const {intToHex, signMessage} = lib;
const _ = require("lodash");

function addInput(skeleton, input)
{
	// Convert capacity to hex string.
	input = _.cloneDeep(input);
	input.cell_output.capacity = intToHex(input.cell_output.capacity);

	return skeleton.update("inputs", (i)=>i.push(input));
}

function addOutput(skeleton, output)
{
	// Convert capacity to hex string.
	output = _.cloneDeep(output);
	output.cell_output.capacity = intToHex(output.cell_output.capacity);

	return skeleton.update("outputs", (i)=>i.push(output));
}

async function sendTransaction(nodeUrl, signedTx)
{
	const rpc = new RPC(nodeUrl);
	const res = await rpc.send_transaction(signedTx);
	
	return res;
}

function signTransaction(skeleton, privateKey)
{
	// Sign the transaction with our private key.
	skeleton = secp256k1Blake160.prepareSigningEntries(skeleton);
	const signingEntries = skeleton.get("signingEntries").toArray();
	const signature = signMessage(privateKey, signingEntries[0].message);
	const tx = sealTransaction(skeleton, [signature]);

	return tx;
}

module.exports =
{
	addInput,
	addOutput,
	sendTransaction,
	signTransaction
};
