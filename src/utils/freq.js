export const freqStartsWith = (freq, prefix) => {
  if (freq === undefined || freq === null) {
    return false;
  }
  const value = typeof freq === "number" ? freq.toString() : String(freq);
  return value.startsWith(prefix);
};
