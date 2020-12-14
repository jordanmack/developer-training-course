"use strict";

const {addressToScript} = require("@ckb-lumos/helpers");
const {addInput, addOutput, describeTransaction, getLiveCell, initializeLab, sendTransaction, signTransaction} = require("./lab.js");

const nodeUrl = "http://127.0.0.1:8114/";
const privateKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const address = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";
const previousOutput =
{
	tx_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
	index: "0x0"
};
const txFee = 100_000n;

async function main()
{
	// Initialize our lab and create a basic transaction skeleton to work with.
	let {transaction} = await initializeLab(nodeUrl, privateKey);

	// Add the input cell to the transaction.
	const input = await getLiveCell(nodeUrl, previousOutput);
	transaction = addInput(transaction, input);

	// Add an output cell.
	const output = {cell_output: {capacity: input.cell_output.capacity - txFee, lock: addressToScript(address), type: null}, data: "0x"};
	transaction = addOutput(transaction, output);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey);

	// Send the transaction to the RPC node.
	const result = await sendTransaction(nodeUrl, signedTx);
	console.log("Transaction Sent:", result);
}
main();
