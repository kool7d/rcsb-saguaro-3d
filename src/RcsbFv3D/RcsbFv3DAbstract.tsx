import * as React from "react";
import * as ReactDom from "react-dom";
import {RcsbFv3DComponent} from './RcsbFv3DComponent';
import {StructureViewInterface} from "../RcsbFvStructure/RcsbFvStructure";
import {SequenceViewInterface} from "../RcsbFvSequence/RcsbFvSequence";
import {EventType, RcsbFvContextManager} from "../RcsbFvContextManager/RcsbFvContextManager";
import {PluginContext} from "molstar/lib/mol-plugin/context";
import {CSSProperties} from "react";


export interface RcsbFv3DAbstractInterface {
    elementId: string;
    cssConfig?:{
        rootPanel?: CSSProperties,
        structurePanel?: CSSProperties,
        sequencePanel?: CSSProperties
    }
}


export abstract class RcsbFv3DAbstract {

    protected elementId: string;
    protected structureConfig: StructureViewInterface;
    protected sequenceConfig: SequenceViewInterface;
    protected ctxManager: RcsbFvContextManager = new RcsbFvContextManager();
    private fullScreenFlag: boolean = false;
    protected cssConfig:{
        rootPanel?: CSSProperties,
        structurePanel?: CSSProperties,
        sequencePanel?: CSSProperties
    } | undefined;

    constructor(config?: any) {
        if(config != null)
            this.init(config);
    }

    protected init(config: any){}

    public render(): void{
        if(this.elementId == null )
            throw "HTML element not found";
        const element: HTMLElement = document.getElementById(this.elementId) ?? document.createElement<"div">("div");
        if(element.getAttribute("id") == null) {
            element.setAttribute("id", this.elementId);
            document.body.append(element);
            this.fullScreenFlag = true;
            document.body.style.overflow = "hidden";
        }

        ReactDom.render(
            <RcsbFv3DComponent
                structurePanelConfig={this.structureConfig}
                sequencePanelConfig={this.sequenceConfig}
                id={"RcsbFv3D_innerDiv_"+Math.random().toString(36).substr(2)}
                ctxManager={this.ctxManager}
                cssConfig={this.cssConfig}
                unmount={this.unmount.bind(this)}
                fullScreen={this.fullScreenFlag}
            />,
            element
        );
    }

    public unmount(removeHtmlElement?:boolean): void{
        const element: HTMLElement | null = document.getElementById(this.elementId);
        if(element != null) {
            ReactDom.unmountComponentAtNode(element);
            if(removeHtmlElement) {
                element.remove();
                document.body.style.overflow = "visible";
            }
            window.history.back();
        }
    }

    public updateConfig(config: {structurePanelConfig?: StructureViewInterface; sequencePanelConfig?: SequenceViewInterface;}){
        this.ctxManager.next({eventType: EventType.UPDATE_CONFIG, eventData:config});
    }

    public pluginCall(f: (plugin: PluginContext) => void){
        this.ctxManager.next({eventType: EventType.PLUGIN_CALL, eventData:f});
    }

}