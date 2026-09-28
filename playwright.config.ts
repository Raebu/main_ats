import{defineConfig,devices}from"@playwright/test";
export default defineConfig({
  testDir:"./tests/e2e",timeout:30000,retries:1,
  reporter:[["list"],["html",{open:"never"}]],
  use:{trace:"retain-on-failure",screenshot:"only-on-failure"},
  projects:[
    {name:"desktop",use:{...devices["Desktop Chrome"]}},
    {name:"mobile",use:{...devices["Pixel 7"]}}
  ]
});