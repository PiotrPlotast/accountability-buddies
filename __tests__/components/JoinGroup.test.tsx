import { fireEvent, render } from "@testing-library/react-native";

import JoinGroupScreen from "@/app/(protected)/join-group";

import {
  buildFakeSupabase,
  buildWrapper,
  makeQueryClient,
} from "../test-utils/render";

describe("Join group", () => {
  it("stops a new group's name at 40 characters, the server's limit", () => {
    const supabase = buildFakeSupabase({});
    const { Wrapper } = buildWrapper({
      supabase,
      queryClient: makeQueryClient(),
    });
    const { getByText, getByPlaceholderText } = render(<JoinGroupScreen />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByText("No code? Create a new group"));

    expect(getByPlaceholderText("Swole Mates").props.maxLength).toBe(40);
  });
});
