"use strict";

const {core} = require("@ckb-lumos/base");
const {locateCellDep, sealTransaction, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector, Indexer} = require("@ckb-lumos/indexer");
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {normalizers, Reader, RPC} = require("ckb-js-toolkit");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {ckbytesToShannons, describeTransction, formattedNumber, indexerReady, shannonsToCkbytesFormatted, signMessage} = require("../lib");

const nodeUrl = "http://127.0.0.1:8114/";
const privateKey = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const lockArg = "0xc8328aabcd9b9e8e64fbc566c4385c3bdeb219d7";
const defaultLockHash = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";
const lockScript =
{
	code_hash: defaultLockHash,
	hash_type: "type",
	args: lockArg
};
const txFee = 100_000n;

async function collectCapacity(indexer, lockScript, capacityRequired)
{
	let cellCollector = new CellCollector(indexer, {lock: lockScript, type: null});
	
	let inputs = [];
	let inputCapacity = 0n;

	for await (const cell of cellCollector.collect())
	{
		inputs.push(cell);
		inputCapacity += BigInt(cell.cell_output.capacity);

		if(inputCapacity >= capacityRequired)
			break;
	}

	if(inputCapacity < capacityRequired)
		throw new Error("Unable to collect enough cells to fulfill the capacity requirements.");

	return {inputs, inputCapacity};
}

async function main()
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = new Indexer(nodeUrl, "./indexed-data");
	indexer.startForever();
	await indexerReady(indexer, (indexerTip, rpcTip)=>console.log(`Indexer Progress: ${indexerTip}/${rpcTip}`), 0);

	// Define our capacity tracking variables.
	let capacityRequired = 61n;
	let capacityTotal = 0n;

	// Create a transaction skeleton.
	let skeleton = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	skeleton = skeleton.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep(lockScript)));

	// Add the input capacity cells.
	const {inputs, inputCapacity} = await collectCapacity(indexer, lockScript, capacityRequired);
	skeleton = skeleton.update("inputs", (i)=>i.concat(inputs));
	capacityTotal += inputCapacity;

	// Add a change cell as our output.
	if(capacityTotal - capacityRequired > ckbytesToShannons(1))
	{
		let output = {cell_output: {capacity: "0x"+(BigInt(capacityTotal - capacityRequired - txFee)).toString(16), lock: lockScript, type: null}, data: "0x"};
		skeleton = skeleton.update("outputs", (o)=>o.push(output));
		capacityRequired += BigInt(output.cell_output.capacity);
	}

	// Add in a placeholder witness which we will sign below.
	const witness = new Reader(core.SerializeWitnessArgs(normalizers.NormalizeWitnessArgs({lock: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"}))).serializeJson();
	skeleton = skeleton.update("witnesses", (w)=>w.push(witness));
	
	// Sign the transaction with our private key.
	skeleton = secp256k1Blake160.prepareSigningEntries(skeleton);
	const signingEntries = skeleton.get("signingEntries").toArray();
	const signature = signMessage(privateKey, signingEntries[0].message);
	const tx = sealTransaction(skeleton, [signature]);

	// Print the details of the transaction to the console.
	describeTransction(skeleton.toJS());
	console.log("");
	console.log(`Inputs: ${formattedNumber(capacityTotal)} Shannons | Outputs: ${formattedNumber(capacityRequired)} Shannons | TX Fee: ${formattedNumber(txFee)} Shannons`);
	console.log("");

	// Send the transaction to the RPC node.
	const rpc = new RPC(nodeUrl);
	const res = await rpc.send_transaction(tx);
	console.log(res);
}
main();
