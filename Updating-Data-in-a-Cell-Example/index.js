"use strict";

const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript} = require("@ckb-lumos/helpers");
const {CellCollector, Indexer} = require("@ckb-lumos/indexer");
const {addDefaultWitnessPlaceholders, ckbytesToShannons, hexToInt, indexerReady, intToHex, readFileToHexString, sendTransaction, waitForTransactionConfirmation, waitForNextBlock} = require("../lib/index.js");
const {addInput, addOutput, describeTransaction, initializeLab, signTransaction, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const privateKey1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";
// const privateKey1 = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
// const address1 = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";

// This is the private key and address which will be setup with a specific Cell configuration for this lab.
// const privateKey = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
// const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

// This is the address we will be sending to.
// const address2 = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";

// This is the filename that contains the data we want to include in
const dataFile1 = "../files/HelloNervos.txt";
const dataFile2 = "../files/HelloWorld.txt";

// This is the TX fee amount that will be paid in Shannons.
const txFee = 100_000n;

async function main()
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = new Indexer(nodeUrl, "../indexer-data");
	indexer.start();
	console.log("Indexer is syncing. Please wait.");
	await indexerReady(indexer);
	console.log();

	// Initialize our lab and create a basic transaction skeleton to work with.
	let {transaction} = await initializeLab(nodeUrl, indexer);

	// Locate a single Cell with the desired data.
	const {hexString: hexString1} = await readFileToHexString(dataFile1);
	const query = {lock: addressToScript(address1), type: null, data: hexString1};
	const cellCollector = new CellCollector(indexer, query);
	for await (const cell of cellCollector.collect())
	{
		transaction = addInput(transaction, cell);
		break;
	}
	if(transaction.inputs.size === 0)
		throw new Error("Unable to locate a Live Cell with the expected data.");

	// Calculate the total capacity of all inputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a Cell with a capacity large enough for the data being placed in it.
	const {hexString: hexString2} = await readFileToHexString(dataFile2);
	const outputCapacity1 = intToHex(inputCapacity - txFee);
	const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(address1), type: null}, data: hexString2};
	transaction = addOutput(transaction, output1);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the next block, then begin checking if the transaction has confirmed.
	await waitForNextBlock(nodeUrl);
	process.stdout.write("Waiting for transaction to confirm.");
	await waitForTransactionConfirmation(nodeUrl, txid, (_status)=>process.stdout.write("."), {timeoutMs: 0, recheckMs: 3_000});
	console.log("\n");

	console.log("Example completed successfully!");
}
main();
