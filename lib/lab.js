"use strict";

const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {sealTransaction} = require("@ckb-lumos/helpers");
const {Indexer} = require("@ckb-lumos/indexer");
const {indexerReady, signMessage} = require("../lib/index.js");

function addInput(skeleton, input)
{
	return skeleton.update("inputs", (i)=>i.push(input));
}

function addInputs(skeleton, inputs)
{
	for(let input of inputs)
		skeleton = skeleton.update("inputs", (i)=>i.push(input));

	return skeleton;
}

function addOutput(skeleton, output)
{
	return skeleton.update("outputs", (i)=>i.push(output));
}

function addOutputs(skeleton, outputs)
{
	for(let output of outputs)
		skeleton = skeleton.update("outputs", (i)=>i.push(output));

	return skeleton;
}

async function initializeLumosIndexer(nodeUrl)
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = new Indexer(nodeUrl, "../indexer-data");
	indexer.start();
	console.log("Indexer is syncing. Please wait.");
	await indexerReady(indexer, (indexerTip, rpcTip)=>console.log(`Syncing ${Math.floor(Number(indexerTip)/Number(rpcTip)*10_000)/100}% completed.`), {timeoutMs: 0, recheckMs: 900});
	console.log();

	return indexer;
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
	addInputs,
	addOutput,
	addOutputs,
	initializeLumosIndexer,
	signTransaction
};
