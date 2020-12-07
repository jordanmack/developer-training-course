"use strict";

const {addressToScript, ckbytesToShannons} = require("../lib");
const {addInput, addOutput, describeTransaction, getLiveCell, initializeLab, sendTransaction, signTransaction, validateLab} = require("./lab.js");

const nodeUrl = "http://127.0.0.1:8114/";
const privateKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const address = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";
const previousOutput =
{
	tx_hash: ,
	index: 
};
const txFee = ;

async function main()
{
	// Initialize our lab and create a basic transaction skeleton to work with.
	let {transaction} = await initializeLab(nodeUrl, privateKey);

	// Add the input cell to the transaction.
	const input = await getLiveCell(nodeUrl, previousOutput);
	transaction = addInput(transaction, input);

	// Create a Cell with 1,000 CKBytes.
	const output1 = {cell_output: {capacity: ckbytesToShannons(1_000n), lock: addressToScript(address), type: null}, data: "0x"};
	transaction = addOutput(transaction, output1);

	// Create a change Cell for the remaining CKBYtes.
	const output2 = ;
	transaction = addOutput(transaction, output2);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey);

	// Send the transaction to the RPC node.
	const result = await sendTransaction(nodeUrl, signedTx);
	console.log("Transaction Sent:", result);
}
main();
