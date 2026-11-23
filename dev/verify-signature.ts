// 用阿里云官方文档公布的固定参数示例校验 V3 签名实现。
// 参考：https://help.aliyun.com/zh/sdk/product-overview/v3-request-structure-and-signature
import { signV3 } from "../functions/aliyun.ts";

const EXPECTED = "06563a9e1b43f5dfe96b81484da74bceab24a1d853912eee15083a6f0f3283c0";

const signed = await signV3({
  method: "POST",
  host: "ecs.cn-shanghai.aliyuncs.com",
  canonicalUri: "/",
  query: {
    ImageId: "win2019_1809_x64_dtc_zh-cn_40G_alibase_20230811.vhd",
    RegionId: "cn-shanghai",
  },
  action: "RunInstances",
  version: "2014-05-26",
  body: new Uint8Array(0),
  accessKeyId: "YourAccessKeyId",
  accessKeySecret: "YourAccessKeySecret",
  date: "2023-10-26T10:22:32Z",
  nonce: "3156853299f313e23d1673dc12e1703d",
});

const actual = signed.headers.Authorization.split("Signature=")[1];
const ok = actual === EXPECTED;
console.log(ok ? "PASS 阿里云 V3 签名与官方示例一致" : "FAIL 阿里云 V3 签名不匹配");
console.log("  期望:", EXPECTED);
console.log("  实际:", actual);
console.log("  URL :", signed.url);
process.exit(ok ? 0 : 1);