"use strict";

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

function intToHex(num)
{
	let bigNum = BigInt(num);
	const negative = bigNum < 0n;
	const prefix = (!negative) ? "0x" : "-0x";
	if(negative) bigNum *= -1n;
	const hexValue = prefix + bigNum.toString(16);

	if(negative)
		console.warn("Warning: A negative value was passed to intToHex(). This usually means there has been a capacity miscalculation.");

	return hexValue;
}

function shannonsToCkbytes(shannons)
{
	shannons = BigInt(shannons);

	return shannons / 100_000_000n;
}

module.exports =
{
	ckbytesToShannons,
	formattedNumber,
	getRandomInt,
	hexToInt,
	intToHex,
	shannonsToCkbytes
};
