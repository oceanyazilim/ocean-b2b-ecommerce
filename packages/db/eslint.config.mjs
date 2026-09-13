import { baseConfig } from "@ocean/config/eslint/base";

export default [...baseConfig, { ignores: ["generated/**"] }];
