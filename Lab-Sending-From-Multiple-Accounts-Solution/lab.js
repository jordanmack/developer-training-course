"use strict";

const {addressToScript} = require("@ckb-lumos/helpers");
const {locateCellDep, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector} = require("@ckb-lumos/indexer");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {sealTransaction} = require("@ckb-lumos/helpers");
const {addDefaultWitnessPlaceholders, collectCapacity, describeTransaction: libDescribeTransaction, getLiveCell, sendTransaction, signMessage, waitForConfirmation, DEFAULT_LOCK_HASH} = require("../lib/index.js");
const {ckbytesToShannons, hexToInt, intToHex} = require("../lib/util.js");
const { ALICE_ADDRESS, BOB_ADDRESS, CHARLIE_ADDRESS, BOB_PK, CHARLIE_PK, ALICE_PK, DANIEL_ADDRESS } = require("./accounts.js");
const { isEqual } = require('lodash');

function describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: false,
		showInputs: true,
		showInputType: false,
		showInputData: true,
		showOutputs: true,
		showOutputType: false,
		showOutputData: true,
		showWitnesses: false
	};

	return libDescribeTransaction(transaction, options);
}

async function initializeLab(nodeUrl, indexer)
{
	// Genesis account.
	const fundingAccountPrivateKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
	const fundingAccountAddress = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";	

	// Accounts to fund.
	const ACCOUNTS_TO_FUND = [{address: ALICE_ADDRESS, privateKey: ALICE_PK}, {address: BOB_ADDRESS, privateKey: BOB_PK}, {address: CHARLIE_ADDRESS, privateKey: CHARLIE_PK}];
	const AMOUNT_TO_FUND = ckbytesToShannons(100n);

	// Transaction Fee
	const txFee = 100_000n;

	// Initialize a Lumos instance.
	let transaction = await initializeLumosSkeleton(indexer);

	// Flags to track which addresses were used.
	const addressesUsed = new Set();
	let totalRecycledCapacity = 0n;

	let addressIndex = 1;
	for (const account of ACCOUNTS_TO_FUND) {
		// Recycle all existing Cells to inputs.
		const query = {lock: addressToScript(account.address), type: null};
		const cellCollector = new CellCollector(indexer, query);
		const recycleCells = [];
		for await (const cell of cellCollector.collect())
			recycleCells.push(cell);
		if(recycleCells.length > 0)
			addressesUsed.add(addressIndex);
		transaction = transaction.update("inputs", (i)=>i.concat(recycleCells));

		// Determine the capacity from recycled Cells.
		const recycledCapacity = recycleCells.reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
		totalRecycledCapacity += recycledCapacity;

		// Create cells for the funding address.
		const outputCapacity = intToHex(AMOUNT_TO_FUND);
		const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(account.address), type: null}, data: "0x"};
		transaction = transaction.update("outputs", (i)=>i.push(output));

		addressIndex++;
	}	

	// Get the sum of the outputs.
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Add input capacity cells to the transaction.
	if(outputCapacity - totalRecycledCapacity + ckbytesToShannons(61n) > 0) // Only add if there isn't enough recycled capacity.
	{
		const collectedCells = await collectCapacity(indexer, addressToScript(fundingAccountAddress), outputCapacity - totalRecycledCapacity + ckbytesToShannons(61n));
		transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));
		addressesUsed.add(0);
	}

	// Determine the capacity from all input Cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - txFee);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(fundingAccountAddress), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	// describeTransaction(transaction.toJS());

	// Sign the transaction.
	transaction = secp256k1Blake160.prepareSigningEntries(transaction);
	const signatures = [];
	const signingEntries = transaction.get("signingEntries").toArray();

	if (addressesUsed.has(0)) {
		const signature = signMessage(fundingAccountPrivateKey, signingEntries[0].message);
		signatures.push(signature);
	}

	ACCOUNTS_TO_FUND.map((account, index) => {
		const addressIndex = index + 1;

		if (addressesUsed.has(addressIndex)) {
			const signature = signMessage(account.privateKey, signingEntries[signatures.length].message);
			signatures.push(signature);
		} 
	});

	const signedTx = sealTransaction(transaction, signatures);

	// Send the transaction to the RPC node.
	// process.stdout.write("Setup Transaction Sent: ");
	const txid = await sendTransaction(nodeUrl, signedTx);
	// process.stdout.write(txid);

	// Wait for the transaction to confirm.
	process.stdout.write("Now setting up Cells for lab exercise. Please wait.");
	await waitForConfirmation(nodeUrl, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
	console.log("\n");
}

async function initializeLumosSkeleton(indexer)
{
	// Create a transaction skeleton.
	let skeleton = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash: DEFAULT_LOCK_HASH, hash_type: "type"})));

	return skeleton;
}

async function validateLab(skeleton)
{
	const tx = skeleton.toJS();
	const txFee = 100_000n;

	if(tx.inputs.length < 3)
		throw new Error("This lab requires at least three input Cells.");

	if(tx.outputs.length < 1)
		throw new Error("This lab requires at least one output Cell.");

	if (hexToInt(tx.outputs[0].cell_output.capacity) !== ckbytesToShannons(300n) - txFee)
		throw new Error("This lab requires output 0 to have a capacity of 300 CKBytes minus transaction fee of 0.001 CKB.")

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(txFee !== 100_000n)
		throw new Error("This lab requires a TX Fee of exactly 0.001 CKBytes.");

	if (!isEqual(tx.outputs[0].cell_output.lock, addressToScript(DANIEL_ADDRESS))) {
		throw new Error("This lab requires an output Cell with index 0 to have Daniel default lock.");
	}

	if (!tx.inputs.find(input => isEqual(input.cell_output.lock, addressToScript(ALICE_ADDRESS)))) {
		throw new Error("This lab requires an input Cell with Alice default lock.");
	}

	if (!tx.inputs.find(input => isEqual(input.cell_output.lock, addressToScript(BOB_ADDRESS)))) {
		throw new Error("This lab requires an input Cell with Bob default lock.");
	}

	if (!tx.inputs.find(input => isEqual(input.cell_output.lock, addressToScript(CHARLIE_ADDRESS)))) {
		throw new Error("This lab requires an input Cell with Charlie default lock.");
	}
}

module.exports =
{
	describeTransaction,
	getLiveCell,
	initializeLab,
	validateLab
};
