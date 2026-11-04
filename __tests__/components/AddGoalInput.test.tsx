import { render, fireEvent } from "@testing-library/react-native";

import AddGoalInput from "@/app/components/dashboard/AddGoalInput";

describe("AddGoalInput", () => {
  it("navigates to /new-habit when pressed", async () => {
    const { getByText } = await render(<AddGoalInput />);
    await fireEvent.press(getByText("Add a new habit"));
    // Mocked router instance lives on the expo-router module — see jest.setup.js.
    const { __router } = require("expo-router");
    expect(__router.push).toHaveBeenCalledWith("/new-habit");
  });
});
