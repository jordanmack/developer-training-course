"use strict";

const {initializeConfig} = require("@ckb-lumos/config-manager");
const {CellCollector} = require("@ckb-lumos/indexer");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, initializeLumosIndexer, readFileToHexString, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const privateKey1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

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
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Initialize our lab.
	await initializeLab(nodeUrl, indexer);

	// Locate a single Live Cell with the desired data and add it as an input.
	const {hexString: hexString1} = await readFileToHexString(dataFile1);
	const query = {lock: addressToScript(address1), type: null, data: hexString1};
	const cellCollector = new CellCollector(indexer, query);
	for await (const cell of cellCollector.collect())
	{
		transaction = transaction.update("inputs", (i)=>i.concat(cell));
		break;
	}
	if(transaction.inputs.size === 0)
		throw new Error("Unable to locate a Live Cell with the expected data.");

	// Calculate the total capacity of all inputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a Cell with data from the specified file.
	const {hexString: hexString2} = await readFileToHexString(dataFile2);
	const outputCapacity1 = intToHex(inputCapacity - txFee);
	const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(address1), type: null}, data: hexString2};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");

	console.log("Example completed successfully!");
}
main();
