const safeName = (name: string) => name.replace(/[.$[\]{}]+/g, "");

export default safeName;
