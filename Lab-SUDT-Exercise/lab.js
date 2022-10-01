"use strict";

const {utils, values} = require("@ckb-lumos/base");
const {computeScriptHash} = utils;
const {ScriptValue} = values;
const {addressToScript} = require("@ckb-lumos/helpers");
const {TransactionSkeleton} = require("@ckb-lumos/helpers");
const {CellCollector} = require("@ckb-lumos/ckb-indexer");
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {sealTransaction} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, describeTransaction: libDescribeTransaction, getLiveCell, indexerReady, readFileToHexString, sendTransaction, signMessage, signTransaction, waitForConfirmation, DEFAULT_LOCK_HASH} = require("../lib/index.js");
const {ckbytesToShannons, hexToInt, intToHex, intToU128LeHexBytes, u128LeHexBytesToInt} = require("../lib/util.js");

// These are the private keys and accounts to use with this lab.
const ALICE_PRIVATE_KEY = "0x81dabf8f74553c07999e1400a8ecc4abc44ef81c9466e6037bd36e4ad1631c17";
const ALICE_ADDRESS = "ckt1qyq2a6ymy7fjntsc2q0jajnmljt690g4xpdsyw4k5f";
const BOB_PRIVATE_KEY = "0x5e3bcd5a3c082c9eb1559930417710a39c5249b31090d88de2a2855149d0d981";
const BOB_ADDRESS = "ckt1qyq9gstman8qyjv0ucwqnw0h6z5cn6z9xxlssmqc92";
const CHARLIE_PRIVATE_KEY = "0xdb159ba4ba1ec8abdb7e9f570c7a1a1febf05eeb3f5d6ebdd50ee3bde7740189";
const CHARLIE_ADDRESS = "ckt1qyq9sz6wanl8v3tdmq6as38yq3j9hwg637kqu3e2xn";
const DANIEL_PRIVATE_KEY = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const DANIEL_ADDRESS = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// Genesis account used for funding.
const GENESIS_PRIVATE_KEY = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const GENESIS_ADDRESS = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga";	

// This is the SUDT RISC-V binary.
const DATA_FILE = "../files/sudt";

function describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: true,
		showInputs: true,
		showInputType: true,
		showInputData: true,
		showOutputs: true,
		showOutputType: true,
		showOutputData: true,
		showWitnesses: false
	};

	return libDescribeTransaction(transaction, options);
}

async function initializeLab(NODE_URL, indexer)
{
	// Setup the Cells for the lab.
	await setupCells(NODE_URL, indexer);
}

async function deployCode(NODE_URL, indexer)
{
	// Constants
	const TX_FEE = 100_000n;

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell with data from the specified file.
	const {hexString: hexString1, dataSize: dataSize1} = await readFileToHexString(DATA_FILE);
	const outputCapacity1 = ckbytesToShannons(61n) + ckbytesToShannons(dataSize1);
	const output1 = {cell_output: {capacity: intToHex(outputCapacity1), lock: addressToScript(ALICE_ADDRESS), type: null}, data: hexString1};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add input capacity cells.
	const collectedCells = await collectCapacity(indexer, addressToScript(GENESIS_ADDRESS), outputCapacity1 + ckbytesToShannons(61n) + TX_FEE);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(GENESIS_ADDRESS), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	// describeTransaction(transaction.toJS());

	// Sign the transaction.
	const signedTx = signTransaction(transaction, GENESIS_PRIVATE_KEY);

	// Send the transaction to the RPC node.
	// process.stdout.write("Setup Transaction Sent: ");
	const txid = await sendTransaction(NODE_URL, signedTx);
	// process.stdout.write(txid);

	// Wait for the transaction to confirm.
	// process.stdout.write("Now setting up Cells for lab exercise. Please wait.");
	await waitForConfirmation(NODE_URL, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
	// console.log("\n");

	// Return the out point for the binary so it can be used in the next transaction.
	const outPoint =
	{
		tx_hash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function setupCells(NODE_URL, indexer)
{
	process.stdout.write("Now setting up Cells for lab exercise. Please wait.");

	// Deploy the SUDT binary to guarantee it can be used as a dependency.
	const scriptCodeOutPoint = await deployCode(NODE_URL, indexer);
	await indexerReady(indexer);

	// Genesis account.
	const fundingAccountPrivateKey = GENESIS_PRIVATE_KEY;
	const fundingAccountAddress = GENESIS_ADDRESS;	

	// Accounts to recycle any existing cells.
	const accountsToRecycle = [{address: ALICE_ADDRESS, PRIVATE_KEY: ALICE_PRIVATE_KEY}, {address: BOB_ADDRESS, PRIVATE_KEY: BOB_PRIVATE_KEY}, {address: CHARLIE_ADDRESS, PRIVATE_KEY: CHARLIE_PRIVATE_KEY}, {address: DANIEL_ADDRESS, PRIVATE_KEY: DANIEL_PRIVATE_KEY}];

	// Accounts to fund.
	const accountsToFund = [{address: ALICE_ADDRESS, PRIVATE_KEY: ALICE_PRIVATE_KEY}];
	const amountToFund = ckbytesToShannons(10_000n);
	const numberOfFundCells = 10;

	// Transaction Fee
	const TX_FEE = 100_000n;

	// Initialize a Lumos instance.
	let transaction = TransactionSkeleton();
	const cellDep = {dep_type: "code", out_point: scriptCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Track which addresses were used during cell recycling.
	const addressesUsed = new Set();
	let totalRecycledCapacity = 0n;

	// Cycle through recycle addresses.
	for (const [addressIndex, account] of accountsToRecycle.entries())
	{
		// Recycle all existing cells to inputs.
		const query = {lock: addressToScript(account.address), type: "empty"}; // We can't get things with type scripts since we can't get the 
		const cellCollector = new CellCollector(indexer, query);
		const recycleCells = [];
		for await (const cell of cellCollector.collect())
			recycleCells.push(cell);
		if(recycleCells.length > 0)
			addressesUsed.add(addressIndex+1);
		transaction = transaction.update("inputs", (i)=>i.concat(recycleCells));

		// Determine the capacity from recycled Cells.
		const recycledCapacity = recycleCells.reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
		totalRecycledCapacity += recycledCapacity;
	}

	// Create cells for the funding address.
	for(const account of accountsToFund)
	{
		for(let i = 0; i < numberOfFundCells; i++)
		{
			const outputCapacity = intToHex(amountToFund);
			const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(account.address), type: null}, data: "0x"};
			transaction = transaction.update("outputs", (i)=>i.push(output));
		}
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

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(fundingAccountAddress), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	// describeTransaction(transaction.toJS());

	// Prepare to sign the transaction.
	transaction = secp256k1Blake160.prepareSigningEntries(transaction);
	const signatures = [];
	const signingEntries = transaction.get("signingEntries").toArray();

	// Sign with the recycling addresses if they were used.
	accountsToRecycle.map((account, index) =>
	{
		const addressIndex = index + 1;
		if(addressesUsed.has(addressIndex))
		{
			const signature = signMessage(account.PRIVATE_KEY, signingEntries[signatures.length].message);
			signatures.push(signature);
		} 
	});

	// Sign with the genesis account if it was used.
	if(addressesUsed.has(0))
	{
		const signature = signMessage(fundingAccountPrivateKey, signingEntries[0].message);
		signatures.push(signature);
	}

	// Finalize the transaction.
	const signedTx = sealTransaction(transaction, signatures);

	// Send the transaction to the RPC node.
	// process.stdout.write("Setup Transaction Sent: ");
	const txid = await sendTransaction(NODE_URL, signedTx);
	// process.stdout.write(txid);

	// Wait for the transaction to confirm.
	// process.stdout.write("Now setting up Cells for lab exercise. Please wait.");
	await waitForConfirmation(NODE_URL, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
	await indexerReady(indexer, (_indexerTip, _rpcTip)=>process.stdout.write("."));
	console.log("\n");
}

async function validateLab(skeleton, action)
{
	if(action == "deploy")
		return;
	else if(action == "create")
		await validateLabCreate(skeleton);
	else if(action == "transfer")
		await validateLabTransfer(skeleton);
	else if(action == "consume")
		await validateLabConsume(skeleton);
	else
		throw new Error("Invalid action specified");
}

async function validateLabCreate(skeleton)
{
	const tx = skeleton.toJS();

	if(tx.inputs.length !== 1)
		throw new Error("This lab requires one input cell.");

	if(tx.outputs.length !== 5)
		throw new Error("This lab requires four output cells.");

	// Alice's cells.
	for(let i = 0; i < 3; i++)
	{
		if(new ScriptValue(tx.outputs[i].cell_output.lock).hash() !== "0xbc60079e66ea8597a653f1bacdabf33d91a8aebb3e083ab35d59b4e54465aae1")
			throw new Error(`This lab requires output ${i} to use the default lock script for Alice's address.`);

		if(!tx.outputs[i].cell_output.type || tx.outputs[i].cell_output.type.args != computeScriptHash(addressToScript(ALICE_ADDRESS)))
			throw new Error(`This lab requires output ${i} to use the SUDT type script with Alice's lock hash as the args.`);

		const capacity = 142n;
		if(BigInt(tx.outputs[i].cell_output.capacity) !== ckbytesToShannons(capacity))
			throw new Error(`This lab requires output ${i} to have a capacity of ${capacity} CKBytes.`);

		const data = ["0x64000000000000000000000000000000", "0x2c010000000000000000000000000000", "0xbc020000000000000000000000000000"];
		if(tx.outputs[i].data !== data[i])
			throw new Error(`This lab requires output ${i} to have a data value of "${data[i]}".`);
	}

	// Daniel's cell.
	if(new ScriptValue(tx.outputs[3].cell_output.lock).hash() !== "0x6ee8b1ea3db94183c5e5a47fbe82110101f6f8d3e18d1ecd4d6a5425e648da69")
		throw new Error(`This lab requires output 3 to use the default lock script for Daniel's address.`);
	if(!tx.outputs[3].cell_output.type || tx.outputs[3].cell_output.type.args != computeScriptHash(addressToScript(ALICE_ADDRESS)))
		throw new Error(`This lab requires output 3 to use the SUDT type script with Alice's lock hash as the args.`);
	if(BigInt(tx.outputs[3].cell_output.capacity) !== ckbytesToShannons(142n))
		throw new Error(`This lab requires output 3 to have a capacity of ${142n} CKBytes.`);
	if(tx.outputs[3].data !== "0x84030000000000000000000000000000")
		throw new Error(`This lab requires output 3 to have a data value of "0x84030000000000000000000000000000".`);

	// Alice's change cell.
	if(new ScriptValue(tx.outputs[4].cell_output.lock).hash() !== "0xbc60079e66ea8597a653f1bacdabf33d91a8aebb3e083ab35d59b4e54465aae1")
		throw new Error(`This lab requires output 4 to use the default lock script for Alice's address.`);
	if(!!tx.outputs[4].cell_output.type)
		throw new Error(`This lab requires output 4 to have no type script.`);
	if(tx.outputs[4].data !== "0x")
		throw new Error(`This lab requires output 4 to have a data value of "0x".`);

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const TX_FEE = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(TX_FEE > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(TX_FEE)} Shannons.`);
}

async function validateLabTransfer(skeleton)
{
	const tx = skeleton.toJS();

	if(tx.inputs.length < 4)
		throw new Error("This lab requires four input cells.");

	if(tx.outputs.length !== 4)
		throw new Error("This lab requires four output cells.");

	// Check all input cells, except for the last one. Ensure they match lock hash, type script args, and capacity.
	for(let i = 0; i < tx.inputs.length-1; i++)
	{
		if(new ScriptValue(tx.inputs[i].cell_output.lock).hash() !== "0xbc60079e66ea8597a653f1bacdabf33d91a8aebb3e083ab35d59b4e54465aae1")
			throw new Error(`This lab requires input ${i} to use the default lock script with Alice's address.`);

		if(!tx.inputs[i].cell_output.type || tx.inputs[i].cell_output.type.args != computeScriptHash(addressToScript(ALICE_ADDRESS)))
			throw new Error(`This lab requires input ${i} to use the SUDT type script with Alice's lock hash as the args.`);

		const capacity = 142n;
		if(BigInt(tx.inputs[i].cell_output.capacity) !== ckbytesToShannons(capacity))
			throw new Error(`This lab requires input ${i} to have a capacity of ${capacity} CKBytes.`);	
	}

	// Check all input cells, except for the last one. Ensure the proper data cells were included, but allow extras.
	{
		const data = ["0x64000000000000000000000000000000", "0x2c010000000000000000000000000000", "0xbc020000000000000000000000000000"];
		const foundData = new Set();
		for(let i = 0; i < tx.inputs.length-1; i++)
		{
			if(!!tx.inputs[i].data && data.includes(tx.inputs[i].data))
				foundData.add(tx.inputs[i].data);
		}
		if(data.length !== foundData.length)
		{
			for(const d of data)
			{
				if(!foundData.has(d))
					throw new Error(`This lab requires at least one input to have a data value of "${d}".`);
			}
		}
	}

	// Check the final input capacity cell.
	for(let i = tx.inputs.length-1; i < tx.inputs.length; i++)
	{
		if(new ScriptValue(tx.inputs[i].cell_output.lock).hash() !== "0xbc60079e66ea8597a653f1bacdabf33d91a8aebb3e083ab35d59b4e54465aae1")
			throw new Error(`This lab requires input ${i} to use the default lock script with Alice's address.`);

		if(!!tx.inputs[i].cell_output.type)
			throw new Error(`This lab requires output ${i} to have no type script.`);
	
		if(tx.inputs[i].data !== "0x")
			throw new Error(`This lab requires output ${i} to have a data value of "0x".`);
	}

	// Check the first two output cell's lock script and data.
	for(let i = 0; i < 2; i++)
	{
		const lockScripts = [["0x04b95a2e4757a7870aa7620b000a602c2db5a9daf64c471bcba17fa395859f96", "Bob"], ["0x3ea732766e85cc6135630373ebbabcb4b79fea7e1473385f8682c51d78b97b48", "Charlie"]];
		if(new ScriptValue(tx.outputs[i].cell_output.lock).hash() !== lockScripts[i][0])
			throw new Error(`This lab requires output ${i} to use the default lock script with ${lockScripts[i][1]}'s address.`);

		if(!tx.outputs[i].cell_output.type || tx.outputs[i].cell_output.type.args != computeScriptHash(addressToScript(ALICE_ADDRESS)))
			throw new Error(`This lab requires output ${i} to use the SUDT type script with Alice's lock hash as the args.`);

		const data = ["0xc8000000000000000000000000000000", "0xf4010000000000000000000000000000"];
		if(tx.outputs[i].data !== data[i])
			throw new Error(`This lab requires output ${i} to have a data value of "${data[i]}".`);
	}

	// Alice's token change cell.
	const inputTokens = tx.inputs.reduce((a, c)=>a+((!!c.cell_output.type&&!!c.data)?u128LeHexBytesToInt(c.data):0n), 0n);
	const outputTokens = tx.outputs.slice(0, 2).reduce((a, c)=>a+((!!c.cell_output.type&&!!c.data)?u128LeHexBytesToInt(c.data):0n), 0n);
	const changeTokens = inputTokens - outputTokens;
	if(new ScriptValue(tx.outputs[2].cell_output.lock).hash() !== "0xbc60079e66ea8597a653f1bacdabf33d91a8aebb3e083ab35d59b4e54465aae1")
		throw new Error(`This lab requires output 2 to use the default lock script for Alice's address.`);
	if(!tx.outputs[2].cell_output.type || tx.outputs[2].cell_output.type.args != computeScriptHash(addressToScript(ALICE_ADDRESS)))
		throw new Error(`This lab requires output 2 to use the SUDT type script with Alice's lock hash as the args.`);
	if(tx.outputs[2].data !== intToU128LeHexBytes(changeTokens))
		throw new Error(`This lab requires output 2 to have a data value of "${intToU128LeHexBytes(changeTokens)}".`);

	// Alice's change cell.
	if(new ScriptValue(tx.outputs[3].cell_output.lock).hash() !== "0xbc60079e66ea8597a653f1bacdabf33d91a8aebb3e083ab35d59b4e54465aae1")
		throw new Error(`This lab requires output 3 to use the default lock script for Alice's address.`);
	if(!!tx.outputs[3].cell_output.type)
		throw new Error(`This lab requires output 3 to have no type script.`);
	if(tx.outputs[3].data !== "0x")
		throw new Error(`This lab requires output 3 to have a data value of "0x".`);

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const TX_FEE = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(TX_FEE > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(TX_FEE)} Shannons.`);
}

async function validateLabConsume(skeleton)
{
	const tx = skeleton.toJS();

	// if(tx.inputs.length < 4)
	// 	throw new Error("This lab requires four input cells.");

	if(tx.outputs.length !== 1)
		throw new Error("This lab requires one output cell.");

	// Check all input cells. Ensure they match lock hash and capacity.
	for(let i = 0; i < tx.inputs.length-1; i++)
	{
		if(new ScriptValue(tx.inputs[i].cell_output.lock).hash() !== "0xbc60079e66ea8597a653f1bacdabf33d91a8aebb3e083ab35d59b4e54465aae1")
			throw new Error(`This lab requires input ${i} to use the default lock script with Alice's address.`);

		if(!tx.inputs[i].cell_output.type || tx.inputs[i].cell_output.type.args != computeScriptHash(addressToScript(ALICE_ADDRESS)))
			throw new Error(`This lab requires input ${i} to use the SUDT type script with Alice's lock hash as the args.`);

		const capacity = 142n;
		if(BigInt(tx.inputs[i].cell_output.capacity) !== ckbytesToShannons(capacity))
			throw new Error(`This lab requires input ${i} to have a capacity of ${capacity} CKBytes.`);	
	}

	// Alice's change cell.
	if(new ScriptValue(tx.outputs[0].cell_output.lock).hash() !== "0xbc60079e66ea8597a653f1bacdabf33d91a8aebb3e083ab35d59b4e54465aae1")
		throw new Error(`This lab requires output 0 to use the default lock script for Alice's address.`);
	if(tx.outputs[0].cell_output.type !== null)
		throw new Error(`This lab requires output 0 to have no type script.`)
	if(tx.outputs[0].data !== "0x")
		throw new Error(`This lab requires output 0 to have a data value of "0x".`);

	const inputCapacity = skeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = skeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const TX_FEE = inputCapacity - outputCapacity;

	if(outputCapacity > inputCapacity)
		throw new Error("More capacity is required by the outputs than is available in the inputs.");

	if(TX_FEE > ckbytesToShannons(1))
		throw new Error(`The TX Fee provided is too large: ${formattedNumber(TX_FEE)} Shannons.`);
}

module.exports =
{
	describeTransaction,
	getLiveCell,
	initializeLab,
	signTransaction,
	validateLab
};