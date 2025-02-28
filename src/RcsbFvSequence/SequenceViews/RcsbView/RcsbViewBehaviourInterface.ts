import {DataContainer} from "../../../Utils/DataContainer";
import {
    RcsbFvModulePublicInterface
} from "@rcsb/rcsb-saguaro-app/build/dist/RcsbFvWeb/RcsbFvModule/RcsbFvModuleInterface";
import {RcsbFvStateInterface} from "../../../RcsbFvState/RcsbFvStateInterface";

export interface RcsbViewBehaviourInterface {

    observe(rcsbFvContainer: DataContainer<RcsbFvModulePublicInterface>, stateManager: RcsbFvStateInterface): void;
    unsubscribe(): void;

}