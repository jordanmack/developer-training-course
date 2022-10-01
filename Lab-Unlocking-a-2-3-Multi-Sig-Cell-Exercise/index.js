"use strict";

const {core,utils} = require("@ckb-lumos/base");
const {ckbHash} = utils;
const {secp256k1Blake160Multisig, secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton, locateCellDep, sealTransaction} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, sendTransaction, signTransaction, waitForTransactionConfirmation, MULTISIG_LOCK_HASH, indexerReady, getLiveCell, signMessage} = require("../lib/index.js");
const {ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex, arrayBufferToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLabDeploy, validateLabConsumption} = require("./lab.js");
const {normalizers} = require("ckb-js-toolkit");

const SECP_SIGNATURE_PLACEHOLDER_DEFAULT = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8116/";

// These are the accounts which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";
const PRIVATE_KEY_2 = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const ADDRESS_2 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga";
const PRIVATE_KEY3 = "0x81dabf8f74553c07999e1400a8ecc4abc44ef81c9466e6037bd36e4ad1631c17";
const address3 = "ckt1qyq2a6ymy7fjntsc2q0jajnmljt690g4xpdsyw4k5f";

// Multi-Sig configuration.
const multisigAddresses = ?;
const multisigReserved = ?;
const multisigMustMatch = ?;
const multisigThreshold = ?;
const multisigPublicKeys = ?;

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function createMultiSigCell(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell that uses the multi-sig lock.

	// Add capacity to the transaction.

	// Get the capacity sums of the inputs and outputs.

	// Create a change Cell for the remaining CKBytes.

	// Add in the witness placeholders.

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLabDeploy(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	const outPoints = [
		{tx_hash: txid, index: "0x0"},
		{tx_hash: txid, index: "0x1"}
	];

	return outPoints;
}

async function consumeMultiSigCell(indexer, deployOutPoints) {
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the multi sig lock script.

	// Get a live cell for each out point and add to the transaction.

	// Get the capacity sum of the inputs.

	// Create a Cell for the CKBytes.

	// Add in the witness placeholders.

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLabConsumption(transaction);

	// Sign the transaction.

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");
}

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(config);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);

	const deployOutPoints = await createMultiSigCell(indexer);

	await consumeMultiSigCell(indexer, deployOutPoints);

	console.log("Lab completed successfully!\n");

	process.exit(0);
}
main();
