"use strict";

const {addressToScript, describeTransactionSimple} = require("../lib");
const {addInput, addOutput, getLiveCell, initializeLab, sendTransaction, signTransaction} = require("./lab.js");

const nodeUrl = "http://127.0.0.1:8114/";

const privateKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const address = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";

const previousOutput =
{
	tx_hash: "0xc049d5efe9c9d78833ed1378016994f53103a3187ab4124e3c5084066df0ffa7",
	index: "0x127"
};
const txFee = 100_000n;

async function main()
{
	// Initialize our lab and create a basic transaction skeleton to work with.
	let {skeleton} = await initializeLab(nodeUrl, privateKey);

	// Add the input cell.
	const input = await getLiveCell(nodeUrl, previousOutput);
	skeleton = addInput(skeleton, input);

	// Add an output cell.
	let output = {cell_output: {capacity: input.cell_output.capacity - txFee, lock: addressToScript(address), type: null}, data: "0x"};
	skeleton = addOutput(skeleton, output);

	// Sign the transaction.
	const signedTx = signTransaction(skeleton, privateKey);

	// Print the details of the transaction to the console.
	describeTransactionSimple(skeleton.toJS());

	// Send the transaction to the RPC node.
	const res = await sendTransaction(nodeUrl, signedTx);
	console.log("Transaction Sent:", res);
}
main();
