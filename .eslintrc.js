module.exports = {
    env: {
        node: true,
    },
    plugins: [
    ],
    extends: [
        "defaults",
    ],
    parserOptions: {
        ecmaVersion: 6,
        sourceType: "module",
        ecmaFeatures: {}
    },
    rules: {
        "comma-dangle": 0,
        "camelcase": 2,
    }
};
