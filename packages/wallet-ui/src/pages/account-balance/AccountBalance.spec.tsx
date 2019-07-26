import Enzyme, { mount } from "enzyme";
import Adapter from "enzyme-adapter-react-16";
import { createMemoryHistory, History } from "history";
import React from "react";
import { connect, Provider } from "react-redux";
import { MemoryRouter as Router, RouteComponentProps } from "react-router-dom";
import { Action } from "redux";
import { ThunkDispatch } from "redux-thunk";
import Web3ProviderMock from "../../store/test-utils/web3provider.mock";
import {
  ActionType,
  ApplicationState,
  Deposit,
  ErrorData
} from "../../store/types";
import { deposit } from "../../store/wallet/wallet.mock";
import { RoutePath } from "../../types";
import { testSelector } from "../../utils/testSelector";
import store from "./../../store/store";
import {
  AccountBalance as Component,
  AccountBalanceProps
} from "./AccountBalance";
import mock from "./AccountBalance.context.json";

Enzyme.configure({ adapter: new Adapter() });

function setup() {
  const history = createMemoryHistory();
  const props: RouteComponentProps & { error: ErrorData } = {
    ...mock.props,
    history,
    location: history.location,
    match: {
      isExact: true,
      params: {},
      path: RoutePath.Root,
      url: "http://localhost/"
    }
  };

  const AccountBalance = connect(
    (state: ApplicationState) => ({
      user: state.UserState.user,
      walletState: state.WalletState
    }),
    (dispatch: ThunkDispatch<ApplicationState, null, Action<ActionType>>) => ({
      deposit: (data: Deposit, provider: Web3ProviderMock, history?: History) =>
        dispatch(deposit(data, provider, history))
    })
  )(Component);

  const component = mount(
    <Provider store={store}>
      <Router initialEntries={["/"]}>
        <AccountBalance {...props} />
      </Router>
    </Provider>
  );
  return { props, component, node: AccountBalance };
}

describe("<AccountRegistration />", () => {
  let instance: Enzyme.CommonWrapper<AccountBalanceProps, {}, React.Component>;
  let component: Enzyme.ReactWrapper;
  let props: RouteComponentProps;

  beforeEach(() => {
    const mock = setup();
    component = mock.component;
    instance = mock.component.find(Component);
    props = mock.props;
  });

  it("should render a Proceed button", () => {
    const CTA = component.find(testSelector("deposit-button"));
    expect(CTA.exists()).toBe(true);
    expect(CTA.text()).toBe("Proceed");
  });

  it("should render the form input fields", () => {
    expect(component.find(testSelector("amount-input")).exists()).toBe(true);
  });

  it("should trigger User Creation upon click", () => {
    component.find(testSelector("amount-input")).simulate("change", {
      target: { value: "0.01", validity: { valid: true } }
    });
    component.find(testSelector("deposit-button")).simulate("click");
    expect(props.history.location.pathname).toBe(RoutePath.Channels);
  });
});
