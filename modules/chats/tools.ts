import "server-only"
import { tool } from "ai"
import { toolSchemas } from "./contracts"

// A tool without `execute` is answered by the browser (clientToolNames).
export const chatTools = {
  getWeatherInformation: tool({
    description: "show the weather in a given city to the user",
    inputSchema: toolSchemas.getWeatherInformation.input,
    outputSchema: toolSchemas.getWeatherInformation.output,
    execute: async () => {
      const weatherOptions = ["sunny", "cloudy", "rainy", "snowy", "windy"]
      return weatherOptions[Math.floor(Math.random() * weatherOptions.length)]
    },
  }),
  askForConfirmation: tool({
    description: "Ask the user for confirmation.",
    inputSchema: toolSchemas.askForConfirmation.input,
    outputSchema: toolSchemas.askForConfirmation.output,
  }),
  getLocation: tool({
    description:
      "Get the user location. Always ask for confirmation before using this tool.",
    inputSchema: toolSchemas.getLocation.input,
    outputSchema: toolSchemas.getLocation.output,
  }),
}
