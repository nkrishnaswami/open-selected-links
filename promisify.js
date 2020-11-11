/*
 * Converts a function taking a callback receiving values into a
 * Promise.
 *
 * @param {Function} func This is a function taking one or more
 *     arguments, the last of which is a callback function. Its return
 *     value, if any, is discarded. Note that if the callback is
 *     expected to take an error argument, this will be resolved
 *     rather than rejected.
 * @return {Promise} A promise that resolves to the callback's
 *     arguments as undefined if none, a single argument if one, or an
 *     an array of arguments if more than one.
 */
export const Promisify = function(func) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      args.push((...cb_args) => {
	console.log("cb_args is", cb_args);
	if (cb_args.length === 0) {
	  console.log("length 0; resolving with undefined");
	  resolve();
	} else if (cb_args.length === 1) {
	  console.log("length 1; resolving with", cb_args[0]);
	  resolve(cb_args[0]);
	} else {
	  console.log("length", cb_args.length,"; resolving with", cb_args[0]);
	  resolve(cb_args);
	}
      });
      func(...args);
    });
  };
}
