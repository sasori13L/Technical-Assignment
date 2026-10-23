// Guards async UI work from completing after sign-in, sign-out, or account change.
let generation = 0;
export const advanceSessionGeneration = () => { generation += 1; };
export const getSessionGeneration = () => generation;
