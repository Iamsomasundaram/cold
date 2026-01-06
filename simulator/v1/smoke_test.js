// smoke_test.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 1, // 1 virtual user
  iterations: 5, // run the test function 5 times
};

export default function () {
  const res = http.get("https://test.k6.io/");

  check(res, {
    "status is 200": (r) => r.status === 200,
  });

  sleep(1); // wait 1s between iterations so output is readable
}
