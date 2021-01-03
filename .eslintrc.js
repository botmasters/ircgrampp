module.exports = {
    "parser": "babel-eslint",
    env: {
        node: true,
    },
    plugins: [
    ],
    /*    extends: [
        "eslint:defaults",
    ],*/
    parserOptions: {
        ecmaVersion: 8,
        sourceType: "module",
        ecmaFeatures: {}
    },
    rules: {
        "comma-dangle": 0,
        "no-debugger": 0,
        "camelcase": 2,
    }
};
