import {
    SaguaroChain,
    StructureViewerInterface,
    SaguaroPosition,
    SaguaroRange,
    ViewerCallbackManagerInterface,
    ViewerActionManagerInterface, ViewerManagerFactoryInterface
} from "../StructureViewerInterface";

import {PluginContext} from "molstar/lib/mol-plugin/context";
import {StructureRepresentationRegistry} from "molstar/lib/mol-repr/structure/registry";
import {ColorTheme} from "molstar/lib/mol-theme/color";
import {Subscription} from "rxjs";
import {RcsbFvStateInterface} from "../../RcsbFvState/RcsbFvStateInterface";

export class StructureViewer<R,L,S> implements StructureViewerInterface<R,L,S> {
    private readonly structureViewerManagerFactory:  ViewerManagerFactoryInterface<R,L,S>;
    private callbackManager: ViewerCallbackManagerInterface;
    private actionManager: ViewerActionManagerInterface<R,L>;

    constructor(structureViewerManagerFactory:  ViewerManagerFactoryInterface<R,L,S>) {
        this.structureViewerManagerFactory = structureViewerManagerFactory;
    }

    public init( stateManager: RcsbFvStateInterface, args:S): void {
        const {actionManager,callbackManager} = this.structureViewerManagerFactory.getViewerManagerFactory(stateManager, args);
        this.actionManager = actionManager;
        this.callbackManager = callbackManager;

        this.subscribeSelection();
        this.subscribeHover();
        this.subscribeRepresentationChange();
        this.subscribeModelChange();
    }

    public async clear(): Promise<void>{
        await this.actionManager.clear();
    }

    async load(loadConfig: R): Promise<L|undefined>;
    async load(loadConfig: R[]): Promise<(L|undefined)[]>;
    async load(loadConfig: R|R[]): Promise<(L|undefined)|(L|undefined)[]>{
      const out = await this.actionManager.load(Array.isArray(loadConfig) ? loadConfig: [loadConfig]);
      this.modelChange();
      return out;
    }

    async removeStructure(loadConfig: R|R[]): Promise<void>{
        await this.actionManager.removeStructure(loadConfig);
        this.modelChange();
    }

    public setBackground(color: number) {
    }

    public select(modelId:string, labelAsymId: string, begin: number, end: number, mode: 'select'|'hover', operation:'add'|'set', operatorName?:string): void;
    public select(selection: Array<SaguaroPosition>, mode: 'select'|'hover', operation:'add'|'set'): void;
    public select(selection: Array<SaguaroRange>, mode: 'select'|'hover', operation:'add'|'set'): void;
    public select(...args: any[]): void{
        this.actionManager.select(args[0],args[1],args[2],args[3],args[4],args[5],args[6]);
    }

    public clearSelection(mode:'select'|'hover', option?:SaguaroChain): void {
        this.actionManager.clearSelection(mode,option);
    }

    public setFocus(modelId: string, labelAsymId: string, begin: number, end: number, operatorName?:string): void{
        this.actionManager.setFocus(modelId,labelAsymId,begin,end,operatorName);
    }
    public clearFocus(): void {
        this.actionManager.clearFocus();
    }

    public cameraFocus(modelId: string, labelAsymId: string, positions:Array<number>, operatorName?:string): void;
    public cameraFocus(modelId: string, labelAsymId: string, begin: number, end: number, operatorName?:string): void;
    public cameraFocus(...args: any[]): void{
        this.actionManager.cameraFocus(args[0],args[1],args[2],args[3],args[4]);
    }

    public async createComponent(componentLabel: string, modelId:string, labelAsymId: string, begin: number, end : number, representationType: StructureRepresentationRegistry.BuiltIn, operatorName?:string): Promise<void>;
    public async createComponent(componentLabel: string, modelId:string, labelAsymId: string, representationType: StructureRepresentationRegistry.BuiltIn, operatorName?:string): Promise<void>;
    public async createComponent(componentLabel: string, residues: Array<SaguaroPosition>, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(componentLabel: string, residues: Array<SaguaroRange>, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(...args: any[]): Promise<void> {
        await this.actionManager.createComponent(args[0],args[1],args[2],args[3],args[4],args[5],args[6]);
    }

    public isComponent(componentLabel: string): boolean{
        return this.actionManager.isComponent(componentLabel);
    }

    public async colorComponent(componentLabel: string, color: ColorTheme.BuiltIn): Promise<void>{
        await this.actionManager.colorComponent(componentLabel,color);
    }

    public getComponentSet(): Set<string>{
        return this.actionManager.getComponentSet();
    }

    public async removeComponent(componentLabel?: string): Promise<void>{
       await this.actionManager.removeComponent(componentLabel);
    }

    public displayComponent(componentLabel: string): boolean;
    public displayComponent(componentLabel: string, visibilityFlag: boolean): void;
    public displayComponent(componentLabel: string, visibilityFlag?: boolean): void|boolean {
        return this.actionManager.displayComponent(componentLabel as any,visibilityFlag as any);
    }

    public subscribeRepresentationChange(): Subscription{
        return this.callbackManager.subscribeRepresentationChange();
    }

    public subscribeHover(): Subscription {
        return this.callbackManager.subscribeHover();
    }

    public subscribeSelection(): Subscription {
        return this.callbackManager.subscribeSelection();
    }

    public pluginCall(f: (plugin: PluginContext) => void){
        this.callbackManager.pluginCall(f);
    }

    public subscribeModelChange(): Subscription {
        return this.callbackManager.subscribeModelChange();
    }

    public modelChange():  void {
        this.callbackManager.modelChange();
    }

    public unsubscribe(): void {
        this.callbackManager.unsubscribe();
    }

    public resetCamera(): void {
        this.actionManager.resetCamera();
    }

    public async exportLoadedStructures(): Promise<void>{
        await this.actionManager.exportLoadedStructures();
    }
}
