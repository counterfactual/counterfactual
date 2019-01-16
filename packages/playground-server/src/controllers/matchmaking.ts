import { v4 as generateUUID } from "uuid";

import { matchmakeUser } from "../db";
import { getNodeAddress } from "../node";
import {
  APIResource,
  ControllerMethod,
  MatchmakingAttributes,
  UserSession
} from "../types";

import Controller from "./controller";

export default class MatchmakingController extends Controller<
  MatchmakingAttributes
> {
  async post() {
    const user = this.user as UserSession;
    const matchedUser = await matchmakeUser(user.ethAddress);

    this.include(
      {
        type: "users",
        id: user.id,
        attributes: {
          username: user.username,
          ethAddress: user.ethAddress
        }
      },
      {
        type: "matchedUser",
        id: matchedUser.id,
        attributes: {
          username: matchedUser.username,
          ethAddress: matchedUser.ethAddress
        }
      }
    );

    return {
      type: "matchmaking",
      id: generateUUID(),
      attributes: {
        intermediary: getNodeAddress()
      },
      relationships: {
        users: {
          data: {
            type: "users",
            id: user.id
          }
        },
        matchedUser: {
          data: {
            type: "matchedUser",
            id: matchedUser.id
          }
        }
      }
    } as APIResource<MatchmakingAttributes>;
  }

  protectedMethods() {
    return [ControllerMethod.Post];
  }
}
