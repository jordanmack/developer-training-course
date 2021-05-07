"use strict";

var {BufferUtility} = require("bufferutility");
const {Reader} = require("ckb-js-toolkit");
const {Uint64LE} = require("int64-buffer");

function arrayBufferToHex(arrayBuffer)
{
	return new Reader(arrayBuffer).serializeJson();
}

function ckbytesToShannons(ckbytes)
{
	ckbytes = BigInt(ckbytes);

	return ckbytes * 100_000_000n;
}

// Modified from source: https://stackoverflow.com/a/2901136/9979
function formattedNumber(number, decimals, dec_point, thousands_sep) {
	number = Number(number);
	var n = !isFinite(+number) ? 0 : +number, 
		prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
		sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
		dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
		toFixedFix = function (n, prec) {
			// Fix for IE parseFloat(0.55).toFixed(0) = 0;
			var k = Math.pow(10, prec);
			return Math.round(n * k) / k;
		},
		s = (prec ? toFixedFix(n, prec) : Math.round(n)).toString().split('.');
	if (s[0].length > 3) {
		s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
	}
	if ((s[1] || '').length < prec) {
		s[1] = s[1] || '';
		s[1] += new Array(prec - s[1].length + 1).join('0');
	}
	return s.join(dec);
}
// Source: https://mzl.la/2LYIu0C
function getRandomInt(min, max)
{
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function hexToArrayBuffer(hexString)
{
	return new Reader(hexString).toArrayBuffer();
}

function hexToInt(hex)
{
	hex = String(hex);
	if(hex.substr(0, 2) !== "0x" && hex.substr(0,3) !== "-0x")
		throw new Error(`Invalid hex value: "${hex}"`);

	const negative = (hex[0] === "-");
	const hexValue = hex.replace("-", "");
	let bigInt = BigInt(hexValue);
	if(negative) bigInt *= -1n;

	if(negative)
		console.warn("Warning: A negative value was passed to hexToInt(). This usually means there has been a capacity miscalculation.");

	return bigInt;
}

function hexToUint8Array(hexString)
{
	return new Uint8Array(hexToArrayBuffer(hexString));
}

function intToHex(num, padding=false)
{
	let bigNum = BigInt(num);
	const negative = bigNum < 0n;
	const prefix = (!negative) ? "0x" : "-0x";
	if(negative) bigNum *= -1n;
	let hexValue = bigNum.toString(16);

	if(padding !== false)
	{
		while (hexValue.length < padding)
		{
			hexValue = "0" + hexValue;
		}
	}

	hexValue = prefix + hexValue;

	if(negative)
		console.warn("Warning: A negative value was passed to intToHex(). This usually means there has been a miscalculation.");

	return hexValue;
}

function intToU32LeHexBytes(num)
{
	let bigNum = BigInt(num);

	if(bigNum < 0n)
		console.error("Warning: A negative value was passed to intToU32LeHexBytes(). This usually means there has been a miscalculation.");

	if(bigNum > 4_294_967_295)
		throw new Error("Warning: A value was passed to intToU32LeHexBytes() that is too large to be properly represented as a 32-bit number");

	const number = Number(bigNum);

	// Source: https://stackoverflow.com/a/24947000/9979
	const buffer = new ArrayBuffer(4);
	const uint64le = new DataView(buffer);
	uint64le.setUint32(0, number, true);

	return arrayBufferToHex(buffer);
}

function intToU64LeHexBytes(num)
{
	let bigNum = BigInt(num);

	if(bigNum < 0n)
		console.error("Warning: A negative value was passed to intToU64LeHexBytes(). This usually means there has been a miscalculation.");

	let uint64le = new Uint64LE(bigNum.toString(10))

	return arrayBufferToHex(uint64le.toArrayBuffer());
}

function u64LeHexBytesToInt(hexString)
{
	const uint8Array = hexToUint8Array(hexString);
	const uint64le = new Uint64LE(uint8Array);
	const bigInt = BigInt(uint64le.toString());

	return bigInt;
}

function intToU128LeHexBytes(num)
{
	let bigNum = BigInt(num);

	if(bigNum < 0n)
		console.error("Warning: A negative value was passed to intToU128LeHexBytes(). This usually means there has been a miscalculation.");

	const buffer = BufferUtility();
	buffer.writeUInt128LE(bigNum, 0);

	return arrayBufferToHex(bufferToArrayBuffer(buffer.toBuffer()));
}

function u128LeHexBytesToInt(hexString)
{
	const uint8Array = hexToUint8Array(hexString);
	const buffer = BufferUtility(uint8Array);
	const bigInt = BigInt(buffer.readUInt128LE(0));

	return bigInt;
}

function shannonsToCkbytes(shannons)
{
	shannons = BigInt(shannons);

	return shannons / 100_000_000n;
}

function stringToHex(string)
{
	return Reader.fromRawString(string).serializeJson();
}

// Original Source: https://stackoverflow.com/a/12101012/9979
function bufferToArrayBuffer(buf)
{
	var ab = new ArrayBuffer(buf.length);
	var view = new Uint8Array(ab);
	for (var i = 0; i < buf.length; ++i)
	{
		view[i] = buf[i];
	}

	return ab;
}

// Original Source: https://stackoverflow.com/a/54646864/9979
function typedArrayToBuffer(uint8Array)
{
    return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteLength + uint8Array.byteOffset)
}

function uint8ArrayToHex(uint8Array)
{
	return arrayBufferToHex(typedArrayToBuffer(uint8Array));
}

module.exports =
{
	arrayBufferToHex,
	ckbytesToShannons,
	formattedNumber,
	getRandomInt,
	hexToArrayBuffer,
	hexToInt,
	hexToUint8Array,
	intToHex,
	intToU32LeHexBytes,
	intToU64LeHexBytes,
	intToU128LeHexBytes,
	shannonsToCkbytes,
	stringToHex,
	u64LeHexBytesToInt,
	u128LeHexBytesToInt,
	uint8ArrayToHex
};
