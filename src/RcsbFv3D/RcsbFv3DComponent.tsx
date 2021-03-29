import * as React from "react";
import * as classes from '../styles/RcsbFvStyle.module.scss';

import {MolstarPlugin} from '../RcsbFvStructure/StructurePlugins/MolstarPlugin';
import {SaguaroPluginInterface} from '../RcsbFvStructure/StructurePlugins/SaguaroPluginInterface';

import '../styles/RcsbFvMolstarStyle.module.scss';
import {RcsbFvSequence, SequenceViewInterface} from "../RcsbFvSequence/RcsbFvSequence";
import {RcsbFvStructure, StructureViewInterface} from "../RcsbFvStructure/RcsbFvStructure";
import {
    EventType,
    RcsbFvContextManager,
    RcsbFvContextManagerInterface,
    UpdateConfigInterface
} from "../RcsbFvContextManager/RcsbFvContextManager";
import {Subscription} from "rxjs";
import {PluginContext} from "molstar/lib/mol-plugin/context";
import {RcsbFvSelection} from "../RcsbFvSelection/RcsbFvSelection";
import {CSSProperties} from "react";

export interface RcsbFv3DComponentInterface {
    structurePanelConfig:StructureViewInterface;
    sequencePanelConfig: SequenceViewInterface;
    id: string;
    ctxManager: RcsbFvContextManager;
    cssConfig?:{
        rootPanel?: CSSProperties,
        structurePanel?: CSSProperties,
        sequencePanel?: CSSProperties
    }
    unmount:(flag:boolean)=>void;
    fullScreen: boolean;
}

export class RcsbFv3DComponent extends React.Component <RcsbFv3DComponentInterface, {structurePanelConfig:StructureViewInterface, sequencePanelConfig:SequenceViewInterface}> {

    private readonly pfvScreenFraction = 0.55;
    private readonly plugin: SaguaroPluginInterface;
    private readonly selection: RcsbFvSelection = new RcsbFvSelection();
    private subscription: Subscription;

    readonly state: {structurePanelConfig:StructureViewInterface, sequencePanelConfig:SequenceViewInterface} = {
        structurePanelConfig: this.props.structurePanelConfig,
        sequencePanelConfig: this.props.sequencePanelConfig
    }

    constructor(props: RcsbFv3DComponentInterface) {
        super(props);
        this.plugin = new MolstarPlugin(this.selection);
    }

    render(): JSX.Element {
        return (
            <div style={RcsbFv3DComponent.mainDivCssConfig(this.props.cssConfig?.rootPanel)} className={ this.props.fullScreen ? classes.fullScreen+" "+classes.rcsbFvMain : classes.rcsbFvMain} >
                <div>
                    <div style={this.structureCssConfig(this.props.cssConfig?.structurePanel)} className={classes.rcsbFvCell}>
                        <RcsbFvStructure
                            {...this.state.structurePanelConfig}
                            componentId={this.props.id}
                            plugin={this.plugin}
                            selection={this.selection}
                        />
                    </div>
                    <div style={this.sequenceCssConfig(this.props.cssConfig?.sequencePanel)} className={classes.rcsbFvCell} >
                        <RcsbFvSequence
                            type={this.state.sequencePanelConfig.type}
                            config={this.state.sequencePanelConfig.config}
                            componentId={this.props.id}
                            plugin={this.plugin}
                            selection={this.selection}
                            title={this.state.sequencePanelConfig.title}
                            subtitle={this.state.sequencePanelConfig.subtitle}
                            unmount={this.props.unmount}
                        />
                    </div>
                </div>
            </div>
        );
    }

    componentDidMount() {
        this.subscription = this.subscribe();
    }

    componentWillUnmount() {
        this.unsubscribe();
    }

    private structureCssConfig(css: CSSProperties | undefined): CSSProperties{
        return {...{width:Math.round((1-this.pfvScreenFraction)*100).toString()+"%", height:"100%", zIndex:100}, ...css };
    }

    private sequenceCssConfig(css: CSSProperties | undefined): CSSProperties{
        return {...{width:Math.round((this.pfvScreenFraction)*100).toString()+"%", height:"100%", overflow:"auto", paddingBottom:5}, ...css };
    }

    private static mainDivCssConfig(css: CSSProperties | undefined): CSSProperties{
        return {...{

        }, ...css}
    }

    private subscribe(): Subscription{
        return this.props.ctxManager.subscribe((obj:RcsbFvContextManagerInterface)=>{
            if(obj.eventType == EventType.UPDATE_CONFIG){
                this.updateConfig(obj.eventData as UpdateConfigInterface)
            }else if(obj.eventType == EventType.PLUGIN_CALL){
                this.plugin.pluginCall(obj.eventData as ((f:PluginContext)=>void));
            }
        });
    }

    /**Unsubscribe className to rxjs events. Useful if many panels are created an destroyed.*/
    private unsubscribe(): void{
        this.subscription.unsubscribe();
    }

    private updateConfig(config:UpdateConfigInterface){
        const structureConfig: StructureViewInterface | undefined = config.structurePanelConfig;
        const sequenceConfig: SequenceViewInterface | undefined = config.sequencePanelConfig;
        if(structureConfig != null && sequenceConfig != null){
            this.setState({structurePanelConfig:structureConfig, sequencePanelConfig:sequenceConfig});
        }else if(structureConfig != null){
            this.setState({structurePanelConfig:structureConfig});
        }else if(sequenceConfig != null){
            this.setState({sequencePanelConfig: sequenceConfig});
        }
    }

}