"use strict";

const {initializeConfig} = require("@ckb-lumos/config-manager");
const {CellCollector, Indexer} = require("@ckb-lumos/ckb-indexer");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, readFileToHexString, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {ckbytesToShannons, hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");
const config = require("../config.json");

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8116/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the filename that contains the data we want to include in
const DATA_FILE_1 = "../files/HelloNervos.txt";
const DATA_FILE_2 = "../files/HelloWorld.txt";
const DATA_FILE3 = "../files/LoremIpsum.txt";

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(config);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);

	// Locate the live cells with the data from DATA_FILE_1 add them as an inputs.
	const {hexString} = await readFileToHexString(DATA_FILE_1);
	const query = {lock: addressToScript(ADDRESS_1), type: null, data: hexString};
	const cellCollector = new CellCollector(indexer, query);
	for await (const cell of cellCollector.collect())
	{
		transaction = transaction.update("inputs", (i)=>i.concat(cell));
	}

	// Create cells with data from the DATA_FILE_2 and DATA_FILE3.
	const DATA_FILEs = [DATA_FILE_2, DATA_FILE3];
	for(const DATA_FILE of DATA_FILEs)
	{
		const {hexString} = await readFileToHexString(DATA_FILE);
		const outputCapacity = intToHex(ckbytesToShannons(61n) + ckbytesToShannons((hexString.length - 2) / 2));
		const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: hexString};
		transaction = transaction.update("outputs", (i)=>i.push(output));
	}

	// Calculate the capacity sum of the inputs and outputs.
	let inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	let outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Add input cells to the transaction to use for capacity, if needed.
	let capacityRequired = outputCapacity - inputCapacity + TX_FEE; // (output1 + output2) - (input1 + input2) + tx fee
	if(capacityRequired !== 0n && capacityRequired > ckbytesToShannons(-61n))
	{
		capacityRequired += ckbytesToShannons(61n);
		const {inputCells} = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
		transaction = transaction.update("inputs", (i)=>i.concat(inputCells));
	}

	// Recalculate the capacity sum of the inputs and outputs.
	inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes, if needed.
	if(inputCapacity - outputCapacity - TX_FEE > 0n)
	{
		const changeCellCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
		const output2 = {cell_output: {capacity: changeCellCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
		transaction = transaction.update("outputs", (i)=>i.push(output2));
	}

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	console.log("Example completed successfully!");
}
main();
