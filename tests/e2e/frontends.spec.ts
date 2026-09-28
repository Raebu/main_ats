import{test,expect,request as playwrightRequest,APIRequestContext}from"@playwright/test";
import AxeBuilder from"@axe-core/playwright";

test.describe.configure({mode:"serial"});

const careers=process.env.CAREERS_E2E_URL||"http://127.0.0.1:3001";
const admin=process.env.ADMIN_E2E_URL||"http://127.0.0.1:3002";
const jobsService=process.env.JOBS_E2E_URL||"http://127.0.0.1:4101";
const tenant="tenant_raeburn_group";
let jobApi:APIRequestContext;
let job:{id:string;slug:string;title:string}|undefined;
const stamp=Date.now()+"-"+Math.random().toString(16).slice(2);
const candidateName="Stage 10 Candidate "+stamp;
const candidateEmail="stage10-"+stamp+"@example.invalid";

test.beforeAll(async()=>{
  jobApi=await playwrightRequest.newContext({baseURL:jobsService,extraHTTPHeaders:{"content-type":"application/json","x-tenant-id":tenant,"x-organisation-ids":"*"}});
  const create=await jobApi.post("/v1/jobs",{data:{
    reference:"E2E-"+stamp,
    slug:"stage10-e2e-"+stamp,
    title:"Stage 10 E2E Vacancy "+stamp,
    hiringOrganisationId:"org_raeburn_group",
    location:"Eastleigh, UK",
    workplaceType:"HYBRID",
    employmentType:"PERMANENT",
    summary:"Disposable browser E2E vacancy",
    description:"Created automatically by the Stage 10 Playwright journey.",
    requirements:"Browser E2E testing",
    benefits:"Test-only vacancy",
    audiences:["MAINSTREAM"]
  }});
  expect(create.ok(),await create.text()).toBeTruthy();
  const created=await create.json();
  job={id:created.id,slug:created.slug,title:created.title};
  const publish=await jobApi.post("/v1/jobs/"+job.id+"/publish",{data:{}});
  expect(publish.ok(),await publish.text()).toBeTruthy();
});

test.afterAll(async()=>{
  if(job?.id)await jobApi.post("/v1/jobs/"+job.id+"/close",{data:{}}).catch(()=>{});
  await jobApi?.dispose();
});

test.describe("Careers candidate journey",()=>{
  test.use({baseURL:careers});

  test("career surface passes serious WCAG checks and keyboard navigation",async({page})=>{
    await page.goto("/careers/accessibility");
    await expect(page.locator("body")).toBeVisible();
    const results=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze();
    expect(results.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe("BODY");
  });

  test("published vacancy is discoverable and candidate can apply end to end",async({page})=>{
    if(!job)throw new Error("E2E vacancy was not created");
    await page.goto("/careers/jobs");
    await expect(page.getByText(job.title,{exact:true})).toBeVisible();

    await page.goto("/careers/jobs/"+job.slug+"/apply");
    await page.getByLabel("Full name").fill(candidateName);
    await page.getByLabel("Email").fill(candidateEmail);
    await page.getByLabel("Location").fill("Hampshire");
    await page.getByLabel("Right to work").fill("UK");
    await page.getByLabel("CV / résumé").setInputFiles({
      name:"stage10-cv.pdf",
      mimeType:"application/pdf",
      buffer:Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF")
    });
    await page.getByLabel(/I have read the recruitment privacy information/).check();
    await page.getByRole("button",{name:"Submit application"}).click();
    await expect(page.getByRole("heading",{name:"Application received"})).toBeVisible({timeout:20_000});

    await page.getByRole("link",{name:"View application status"}).click();
    await expect(page.getByRole("heading",{name:"My Raeburn"})).toBeVisible();
    await expect(page.getByText(job.title,{exact:true})).toBeVisible();

    await page.getByRole("button",{name:"Request my data"}).click();
    await expect(page.getByRole("status")).toContainText("Saved.");

    page.once("dialog",dialog=>dialog.accept());
    await page.getByRole("button",{name:"Withdraw application"}).click();
    await expect(page.getByText("WITHDRAWN",{exact:false})).toBeVisible({timeout:10_000});
  });
});

test.describe("Talent Admin recruiter journey",()=>{
  test.use({baseURL:admin});

  test("recruiter can authenticate and reach operational application surfaces",async({page})=>{
    await page.goto("/login");
    await page.getByRole("textbox",{name:"Email",exact:true}).fill(process.env.E2E_ADMIN_EMAIL||"careers@theraeburngroup.com");
    await page.getByPlaceholder("Password").fill(process.env.E2E_ADMIN_PASSWORD||"change-me-local");
    await page.getByRole("button",{name:"Sign in"}).click();

    await expect(page).toHaveURL(/\/$/,{timeout:10_000});
    await expect(page.getByRole("heading",{name:/Recruitment command centre/i})).toBeVisible();

    await page.goto("/applications");
    await expect(page.getByRole("heading",{name:/Applications/i})).toBeVisible();
    await expect(page.locator("body")).toContainText(candidateName);
  });
});
