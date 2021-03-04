"use strict";

const {core,utils} = require("@ckb-lumos/base");
const {ckbHash} = utils;
const {secp256k1Blake160Multisig, secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton, locateCellDep, sealTransaction} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, initializeLumosIndexer, sendTransaction, signTransaction, waitForTransactionConfirmation, MULTISIG_LOCK_HASH, indexerReady, getLiveCell, signMessage} = require("../lib/index.js");
const {ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex, arrayBufferToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLabDeploy, validateLabConsumption} = require("./lab.js");
const {normalizers} = require("ckb-js-toolkit");

const SECP_SIGNATURE_PLACEHOLDER_DEFAULT = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// These are the accounts which will be used.
const privateKey1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";
const privateKey2 = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const address2 = "ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37";
const privateKey3 = "0x81dabf8f74553c07999e1400a8ecc4abc44ef81c9466e6037bd36e4ad1631c17";
const address3 = "ckt1qyq2a6ymy7fjntsc2q0jajnmljt690g4xpdsyw4k5f";

// Multi-Sig configuration.
const multisigAddresses =
[
	address3,
	address1,
	address2
];
const multisigReserved = 0;
const multisigMustMatch = 1;
const multisigThreshold = 2;
const multisigPublicKeys = multisigAddresses.length;

// This is the TX fee amount that will be paid in Shannons.
const txFee = 100_000n;

function getMultiSigScriptAndHash() {
	const multisigScript = "0x"
		+ multisigReserved.toString(16).padStart(2, "0")
		+ multisigMustMatch.toString(16).padStart(2, "0")
		+ multisigThreshold.toString(16).padStart(2, "0")
		+ multisigPublicKeys.toString(16).padStart(2, "0")
		+ multisigAddresses.map((address)=>addressToScript(address).args.substr(2)).join("");
	
	const multisigScriptHash = ckbHash(hexToArrayBuffer(multisigScript)).serializeJson().substr(0, 42);

	return {
		multisigScript,
		multisigScriptHash
	};
}

async function createMultiSigCell(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell that uses the multi-sig lock.
	const outputCapacity1 = intToHex(ckbytesToShannons(61n));

	const { multisigScriptHash } = getMultiSigScriptAndHash();

	const lockScript1 =
	{
		code_hash: MULTISIG_LOCK_HASH,
		hash_type: "type",
		args: multisigScriptHash
	};

	const output1 = {cell_output: {capacity: outputCapacity1, lock: lockScript1, type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add capacity to the transaction.
	const capacityRequired = hexToInt(outputCapacity1) + ckbytesToShannons(61n) + txFee; // output1 + minimum for a change cell + tx fee
	const {inputCells} = await collectCapacity(indexer, addressToScript(address1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(inputCells));

	// Get the capacity sums of the inputs and outputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const outputCapacity2 = intToHex(inputCapacity - outputCapacity - txFee);
	const output2 = {cell_output: {capacity: outputCapacity2, lock: addressToScript(address1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output2));	

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLabDeploy(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");

	const outPoints = [
		{tx_hash: txid, index: "0x0"},
		{tx_hash: txid, index: "0x1"}
	];

	return outPoints;
}

async function consumeMultiSigCell(indexer, deployOutPoints) {
	const { multisigScript } = getMultiSigScriptAndHash();

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the multi sig lock script.
	transaction = addDefaultCellDeps(transaction);
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({code_hash: MULTISIG_LOCK_HASH, hash_type: "type"})));

	// Get a live cell for each out point and add to the transaction.
	for(const outPoint of deployOutPoints) {
		const input = await getLiveCell(nodeUrl, outPoint);
		transaction = transaction.update("inputs", (i)=>i.push(input));	
	}

	// Get the capacity sum of the inputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a Cell for the CKBytes.
	const outputCellCapacity = intToHex(inputCapacity - txFee);
	let outputCell = {cell_output: {capacity: outputCellCapacity, lock: addressToScript(address2), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(outputCell));

	// Add in the witness placeholders.
	const multisigPlaceholder = multisigScript + "0".repeat(130).repeat(multisigThreshold);
	const witness = arrayBufferToHex(core.SerializeWitnessArgs(normalizers.NormalizeWitnessArgs({lock: multisigPlaceholder})));
	transaction = transaction.update("witnesses", (w)=>w.push(
		witness,
		arrayBufferToHex(core.SerializeWitnessArgs(normalizers.NormalizeWitnessArgs({lock: SECP_SIGNATURE_PLACEHOLDER_DEFAULT}))))
	);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLabConsumption(transaction);

	// Sign the transaction.
	transaction = secp256k1Blake160Multisig.prepareSigningEntries(transaction);
	transaction = secp256k1Blake160.prepareSigningEntries(transaction);
	const signingEntries = transaction.get("signingEntries").toArray();

	const signature1 = signMessage(privateKey1, signingEntries[0].message);
	const signature3 = signMessage(privateKey3, signingEntries[0].message);
	const multisigSignature = multisigScript + signature1.substr(2) + signature3.substr(2);
	
	const defaultLockSignature = signMessage(privateKey1, signingEntries[1].message);
	
	const signedTx = sealTransaction(transaction, [multisigSignature, defaultLockSignature]);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");
}

async function main()
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Initialize our lab.
	await initializeLab(nodeUrl, indexer);
	await indexerReady(indexer);

	const deployOutPoints = await createMultiSigCell(indexer);

	await consumeMultiSigCell(indexer, deployOutPoints);

	console.log("Lab completed successfully!\n");

	process.exit(0);
}
main();
