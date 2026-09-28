/** @type { import('@storybook/nextjs-vite').StorybookConfig } */
const config={
  stories:["../packages/ui/src/**/*.stories.@(js|jsx)"],
  addons:[],
  framework:{name:"@storybook/nextjs-vite",options:{}},
  docs:{autodocs:true},
};
export default config;
