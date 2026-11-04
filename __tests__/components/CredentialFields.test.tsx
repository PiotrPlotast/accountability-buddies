import { fireEvent, render } from "@testing-library/react-native";

import CredentialFields from "@/app/components/auth/CredentialFields";

async function setup(newPassword = false) {
  const props = {
    email: "",
    password: "",
    onEmailChange: jest.fn(),
    onPasswordChange: jest.fn(),
    onSubmit: jest.fn(),
    newPassword,
  };
  return { props, ...(await render(<CredentialFields {...props} />)) };
}

describe("CredentialFields", () => {
  it("reports what is typed into each field", async () => {
    const { props, getByPlaceholderText } = await setup();

    await fireEvent.changeText(
      getByPlaceholderText("you@example.com"),
      "a@b.c",
    );
    await fireEvent.changeText(getByPlaceholderText("••••••••"), "hunter22");

    expect(props.onEmailChange).toHaveBeenCalledWith("a@b.c");
    expect(props.onPasswordChange).toHaveBeenCalledWith("hunter22");
  });

  it("submits from the password field's Go key", async () => {
    const { props, getByPlaceholderText } = await setup();

    await fireEvent(getByPlaceholderText("••••••••"), "submitEditing");

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  // The password manager offers a saved password on sign-in and a new one on
  // sign-up; the two screens differ in nothing else.
  it("asks the password manager for a saved or a new password", async () => {
    const signIn = (await setup(false)).getByPlaceholderText("••••••••");
    expect(signIn.props.autoComplete).toBe("current-password");
    expect(signIn.props.textContentType).toBe("password");
  });

  it("asks for a new password on sign-up", async () => {
    const signUp = (await setup(true)).getByPlaceholderText("••••••••");
    expect(signUp.props.autoComplete).toBe("new-password");
    expect(signUp.props.textContentType).toBe("newPassword");
  });
});
