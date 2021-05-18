import {Viewer, ViewerProps} from '@rcsb/rcsb-molstar/build/src/viewer';
import {PresetProps} from '@rcsb/rcsb-molstar/build/src/viewer/helpers/preset';
import {
    SaguaroPluginInterface,
    SaguaroPluginModelMapType,
    SaguaroPluginPublicInterface
} from "./SaguaroPluginInterface";

import {PluginContext} from "molstar/lib/mol-plugin/context";
import {Loci} from "molstar/lib/mol-model/loci";
import {Mat4} from "molstar/lib/mol-math/linear-algebra";
import {BuiltInTrajectoryFormat} from "molstar/lib/mol-plugin-state/formats/trajectory";
import {PluginState} from "molstar/lib/mol-plugin/state";
import {
    ResidueIndex,
    Structure,
    StructureElement,
    StructureProperties as SP,
    StructureSelection,
    Queries as Q,
    StructureQuery
} from "molstar/lib/mol-model/structure";
import {OrderedSet} from "molstar/lib/mol-data/int";
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin-state/objects';
import {State} from "molstar/lib/mol-state";
import {StructureRef} from "molstar/lib/mol-plugin-state/manager/structure/hierarchy-state";
import {RcsbFvSelection, ResidueSelectionInterface} from "../../RcsbFvSelection/RcsbFvSelection";
import {AbstractPlugin} from "./AbstractPlugin";
import {Subscription} from "rxjs";
import {InteractivityManager} from "molstar/lib/mol-plugin-state/manager/interactivity";
import {Script} from "molstar/lib/mol-script/script";
import {MolScriptBuilder} from "molstar/lib/mol-script/language/builder";
import {SetUtils} from "molstar/lib/mol-util/set";
import {StructureRepresentationRegistry} from "molstar/lib/mol-repr/structure/registry";
import {ColorTheme} from "molstar/lib/mol-theme/color";

export enum LoadMethod {
    loadPdbId = "loadPdbId",
    loadPdbIds = "loadPdbIds",
    loadStructureFromUrl = "loadStructureFromUrl",
    loadSnapshotFromUrl = "loadSnapshotFromUrl",
    loadStructureFromData = "loadStructureFromData"
}

export interface LoadMolstarInterface {
    method: LoadMethod;
    params: LoadParams | Array<LoadParams>;
}

interface LoadParams {
    pdbId?: string;
    props?: PresetProps;
    matrix?: Mat4;
    url?: string,
    format?: BuiltInTrajectoryFormat,
    isBinary?: boolean,
    type?: PluginState.SnapshotType,
    data?: string | number[]
    id?:string;
}

export class MolstarPlugin extends AbstractPlugin implements SaguaroPluginInterface {
    private plugin: Viewer;
    private innerSelectionFlag: boolean = false;
    private loadingFlag: boolean = false;
    private selectCallbackSubs: Subscription;
    private modelChangeCallback: (chainMap:SaguaroPluginModelMapType)=>void;
    private modelChangeCallbackSubs: Subscription;
    private modelMap: Map<string,string|undefined> = new Map<string, string>();
    private readonly componentSet: Set<string> = new Set<string>();
    private readonly componentVisibility: Map<string,boolean> = new Map<string, boolean>();

    constructor(props: RcsbFvSelection) {
        super(props);
    }

    public init(target: string | HTMLElement, props?: Partial<ViewerProps>) {
        this.plugin = new Viewer(target, {layoutShowControls:false, layoutShowSequence: true, ...props});
        this.plugin.getPlugin().representation.structure.registry
    }

    public clear(): void{
        this.plugin.clear();
    }

    async load(loadConfig: LoadMolstarInterface): Promise<void>{
        this.loadingFlag = true;
        if(MolstarPlugin.checkLoadData(loadConfig)) {
            if (loadConfig.method == LoadMethod.loadPdbId) {
                const config: LoadParams = loadConfig.params as LoadParams;
                await this.plugin.loadPdbId(config.pdbId!, config.props, config.matrix);
            } else if (loadConfig.method == LoadMethod.loadPdbIds) {
                const config: Array<LoadParams> = loadConfig.params as Array<LoadParams>;
                await this.plugin.loadPdbIds(config.map((d) => {
                    return {pdbId: d.pdbId!, props: d.props, matrix: d.matrix}
                }));
            } else if (loadConfig.method == LoadMethod.loadStructureFromUrl) {
                const config: LoadParams = loadConfig.params as LoadParams;
                await this.plugin.loadStructureFromUrl(config.url!, config.format!, config.isBinary!);
            } else if (loadConfig.method == LoadMethod.loadSnapshotFromUrl) {
                const config: LoadParams = loadConfig.params as LoadParams;
                await this.plugin.loadSnapshotFromUrl(config.url!, config.type!);
            } else if (loadConfig.method == LoadMethod.loadStructureFromData) {
                const config: LoadParams = loadConfig.params as LoadParams;
                await this.plugin.loadStructureFromData(config.data!, config.format!, config.isBinary!);
            }
        }
        this.plugin.getPlugin().selectionMode = true;
        this.loadingFlag = false;
        this.mapModels(loadConfig.params);
        this.modelChangeCallback(this.getChains());
    }

    private static checkLoadData(loadConfig: LoadMolstarInterface): boolean{
        const method: LoadMethod = loadConfig.method;
        const params: LoadParams | Array<LoadParams> = loadConfig.params;
        if( method == LoadMethod.loadPdbId ){
            if(params instanceof Array || params.pdbId == null)
                throw loadConfig.method+": missing pdbId";
        }else if( method == LoadMethod.loadPdbIds ){
            if(!(params instanceof Array))
                throw loadConfig.method+": Array object spected";
            for(const d of params){
                if(d.pdbId == null)
                    throw loadConfig.method+": missing pdbId"
            }
        }else if( method == LoadMethod.loadStructureFromUrl ){
            if(params instanceof Array || params.url == null || params.isBinary == null || params.format == null)
                throw loadConfig.method+": arguments needed url, format, isBinary"
        }else if( method == LoadMethod.loadSnapshotFromUrl ){
            if(params instanceof Array || params.url == null || params.type == null)
                throw loadConfig.method+": arguments needed url, type"
        }else if( method == LoadMethod.loadStructureFromData ){
            if(params instanceof Array || params.data == null || params.format == null || params.isBinary == null)
                throw loadConfig.method+": arguments needed data, format, isBinary"
        }
        return true;
    }

    public setBackground(color: number) {
    }

    public select(modelId:string, asymId: string, begin: number, end: number, mode: 'select'|'hover', operation:'add'|'set'): void;
    public select(selection: Array<{modelId:string; asymId: string; position: number;}>, mode: 'select'|'hover', operation:'add'|'set'): void;
    public select(selection: Array<{modelId:string; asymId: string; begin: number; end: number;}>, mode: 'select'|'hover', operation:'add'|'set'): void;
    public select(...args: any[]): void{
        if(args.length === 6){
            this.selectRange(args[0],args[1],args[2],args[3],args[4],args[5]);
        }else if(args.length === 3 && (args[0] as Array<{modelId: string; asymId: string; position: number;}>).length > 0 && typeof (args[0] as Array<{modelId: string; asymId: string; position: number;}>)[0].position === 'number'){
            this.selectSet(args[0],args[1],args[2]);
        }else if(args.length === 3 && (args[0] as Array<{modelId: string; asymId: string; begin: number; end: number;}>).length > 0 && typeof (args[0] as Array<{modelId: string; asymId: string; begin: number; end: number;}>)[0].begin === 'number'){
            this.selectMultipleRanges(args[0],args[1],args[2]);
        }
    }
    private selectRange(modelId:string, asymId: string, begin: number, end: number, mode: 'select'|'hover', operation:'add'|'set'): void {
        if(mode == null || mode === 'select') {
            this.innerSelectionFlag = true;
        }
        this.plugin.select(this.getModelId(modelId), asymId, begin, end, mode, operation);
        this.innerSelectionFlag = false;
    }
    private selectSet(selection: Array<{modelId:string; asymId: string; position: number;}>, mode: 'select'|'hover', operation:'add'|'set'): void {
        if(mode == null || mode === 'select') {
            this.innerSelectionFlag = true;
        }
        this.plugin.select(selection.map(r=>{return{modelId: this.getModelId(r.modelId), position:r.position, asymId: r.asymId}}), mode, operation);
        this.innerSelectionFlag = false;
    }
    private selectMultipleRanges(selection: Array<{modelId:string; asymId: string; begin: number; end:number;}>, mode: 'select'|'hover', operation:'add'|'set'): void {
        if(mode == null || mode === 'select') {
            this.innerSelectionFlag = true;
        }
        this.plugin.select(selection.map(r=>{return{modelId: this.getModelId(r.modelId), begin:r.begin, end: r.end, asymId: r.asymId}}), mode, operation);
        this.innerSelectionFlag = false;
    }
    public clearSelection(mode:'select'|'hover', option?:{modelId:string; labelAsymId:string;}): void {
        if(mode === 'select') {
            this.plugin.clearFocus();
            this.innerSelectionFlag = true;
        }
        if(option != null)
            this.plugin.clearSelection(mode, {modelId: this.getModelId(option.modelId), labelAsymId: option.labelAsymId});
        else
            this.plugin.clearSelection(mode);
        this.innerSelectionFlag = false;
    }

    public setFocus(modelId: string, asymId: string, begin: number, end: number): void{
        this.plugin.setFocus(this.getModelId(modelId), asymId, begin, end);
    }
    public clearFocus(): void {
        this.plugin.clearFocus();
    }

    public cameraFocus(modelId: string, asymId: string, positions:Array<number>): void;
    public cameraFocus(modelId: string, asymId: string, begin: number, end: number): void;
    public cameraFocus(...args: any[]): void{
        if(args.length === 3){
            this.focusPositions(args[0],args[1],args[2]);
        }else if(args.length === 4){
            this.focusRange(args[0],args[1],args[2],args[3]);
        }
    }
    private focusPositions(modelId: string, asymId: string, positions:Array<number>): void{
        const data: Structure | undefined = getStructureWithModelId(this.plugin.getPlugin().managers.structure.hierarchy.current.structures, this.getModelId(modelId));
        if (data == null) return;
        const sel: StructureSelection = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
            'chain-test': Q.core.rel.eq([asymId, MolScriptBuilder.ammp('label_asym_id')]),
            'residue-test': Q.core.set.has([MolScriptBuilder.set(...SetUtils.toArray(new Set(positions))), MolScriptBuilder.ammp('label_seq_id')])
        }), data);
        const loci: Loci = StructureSelection.toLociWithSourceUnits(sel);
        if(!StructureElement.Loci.isEmpty(loci))
            this.plugin.getPlugin().managers.camera.focusLoci(loci);
        else
            this.plugin.getPlugin().managers.camera.reset();
    }
    private focusRange(modelId: string, asymId: string, begin: number, end: number): void{
        const seqIds: Array<number> = new Array<number>();
        for(let n = begin; n <= end; n++){
            seqIds.push(n);
        }
        this.focusPositions(modelId, asymId, seqIds);
    }

    public async createComponent(componentLabel: string, modelId:string, asymId: string, begin: number, end : number, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(componentLabel: string, modelId:string, asymId: string, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(componentLabel: string, modelId:string, residues: Array<{asymId: string; position: number;}>, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(componentLabel: string, modelId:string, residues: Array<{asymId: string; begin: number; end: number;}>, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(...args: any[]): Promise<void> {
        this.removeComponent(args[0]);
        this.componentVisibility.set(args[0], true);
        this.componentSet.add(args[0]);
        if(args.length === 4)
            await this.plugin.createComponent(args[0], this.getModelId(args[1]), args[2], args[3]);
        else if(args.length === 6)
            await this.plugin.createComponent(args[0], this.getModelId(args[1]), args[2], args[3], args[4], args[5]);
    }

    public isComponent(componentLabel: string): boolean{
        for(const c of this.plugin.getPlugin().managers.structure.hierarchy.currentComponentGroups){
            for(const comp of c){
                if(comp.cell.obj?.label === componentLabel) {
                    return true;
                }
            }
        }
        return false;
    }

    public async colorComponent(componentLabel: string, color: ColorTheme.BuiltIn): Promise<void>{
        for(const c of this.plugin.getPlugin().managers.structure.hierarchy.currentComponentGroups){
            for(const comp of c){
                if(comp.cell.obj?.label === componentLabel) {
                    await this.plugin.getPlugin().managers.structure.component.updateRepresentationsTheme([comp], { color: color });
                    return;
                }
            }
        }
    }

    public getComponentSet(): Set<string>{
        const out: Set<string> = new Set<string>();
        this.plugin.getPlugin().managers.structure.hierarchy.currentComponentGroups.forEach(c=>{
            for(const comp of c){
                if(comp.cell.obj?.label != null && out.has(comp.cell.obj?.label)) {
                    break;
                }else if(comp.cell.obj?.label != null){
                    out.add(comp.cell.obj?.label);
                }
            }
        });
        return out;
    }

    public removeComponent(componentLabel?: string): void{
        if(componentLabel == null){
            this.componentSet.forEach(id=>{
                this.plugin.removeComponent(id);
            })
            this.componentSet.clear();
            this.componentVisibility.clear();
        }else{
            this.plugin.removeComponent(componentLabel);
            this.componentSet.delete(componentLabel);
            this.componentVisibility.delete(componentLabel);
        }
    }

    public displayComponent(componentLabel: string): boolean;
    public displayComponent(componentLabel: string, visibilityFlag: boolean): void;
    public displayComponent(componentLabel: string, visibilityFlag?: boolean): void|boolean {
        if(typeof visibilityFlag === 'boolean')
            return this.changeComponentDisplay(componentLabel, visibilityFlag);
        else
            return this.getComponentDisplay(componentLabel);
    }
    private changeComponentDisplay(componentLabel: string, visibilityFlag: boolean): void{
        if(this.isComponent(componentLabel) && !this.componentVisibility.has(componentLabel))
            this.componentVisibility.set(componentLabel, true);
        if(this.componentVisibility.get(componentLabel) != visibilityFlag) {
            for (const c of this.plugin.getPlugin().managers.structure.hierarchy.currentComponentGroups) {
                for (const comp of c) {
                    if (comp.cell.obj?.label === componentLabel) {
                        if(this.getComponentDisplay(componentLabel) != visibilityFlag)
                            this.plugin.getPlugin().managers.structure.component.toggleVisibility([comp]);
                        return void 0;
                    }
                }
            }
        }
    }
    private getComponentDisplay(componentLabel: string): boolean{
        for (const c of this.plugin.getPlugin().managers.structure.hierarchy.currentComponentGroups) {
            for (const comp of c) {
                if (comp.cell.obj?.label === componentLabel) {
                    return this.componentVisibility.get(componentLabel) ?? false;
                }
            }
        }
        return false;
    }

    public setRepresentationChangeCallback(g:()=>void){
        this.plugin.getPlugin().state.events.cell.stateUpdated.subscribe(o=>{
            if(o.cell.obj?.type.name === "Structure" && this.componentSet.has(o.cell.obj?.label)){
                if(o.cell.state.isHidden != null) {
                    this.componentVisibility.set(o.cell.obj?.label, !o.cell.state.isHidden);
                }
            }
        });
    }

    public setHoverCallback(g:()=>void){
        this.plugin.getPlugin().behaviors.interaction.hover.subscribe((r: InteractivityManager.HoverEvent)=>{
            const sequenceData: Array<ResidueSelectionInterface> = new Array<ResidueSelectionInterface>();
            const loci: Loci = r.current.loci;
            if(StructureElement.Loci.is(loci)){
                const loc = StructureElement.Location.create(loci.structure);
                for (const e of loci.elements) {
                    const modelId: string = e.unit?.model?.id;
                    const seqIds = new Set<number>();
                    loc.unit = e.unit;
                    for (let i = 0, il = OrderedSet.size(e.indices); i < il; ++i) {
                        loc.element = e.unit.elements[OrderedSet.getAt(e.indices, i)];
                        seqIds.add(SP.residue.label_seq_id(loc));
                    }
                    sequenceData.push({
                        modelId: this.getModelId(modelId),
                        labelAsymId: SP.chain.label_asym_id(loc),
                        seqIds
                    });
                }
            }
            this.selection.setSelectionFromResidueSelection(sequenceData, 'hover', 'structure');
            g();
        });
    }

    public setSelectCallback(g:(flag?:boolean)=>void){
        this.selectCallbackSubs = this.plugin.getPlugin().managers.structure.selection.events.changed.subscribe(()=>{
            if(this.innerSelectionFlag) {
                return;
            }
            if(this.plugin.getPlugin().managers.structure.selection.additionsHistory.length > 0) {
                const currentLoci: Loci = this.plugin.getPlugin().managers.structure.selection.additionsHistory[0].loci;
                const loc: StructureElement.Location = StructureElement.Location.create(currentLoci.structure);
                StructureElement.Location.set(
                    loc,
                    currentLoci.structure,
                    currentLoci.elements[0].unit,
                    currentLoci.elements[0].unit.elements[OrderedSet.getAt(currentLoci.elements[0].indices,0)]
                );
                const currentModelId: string = this.getModelId(currentLoci.structure.model.id);
                if(currentLoci.elements.length > 0)
                    if(SP.entity.type(loc) === 'non-polymer') {
                        const resAuthId: number = SP.residue.auth_seq_id(loc);
                        const chainLabelId: string = SP.chain.label_asym_id(loc);
                        const query: StructureQuery = Q.modifiers.includeSurroundings(
                            Q.generators.residues({
                                residueTest:l=>SP.residue.auth_seq_id(l.element) === resAuthId,
                                chainTest:l=>SP.chain.label_asym_id(l.element) === chainLabelId
                            }),
                            {
                                radius: 5,
                                wholeResidues: true
                            });
                        this.innerSelectionFlag = true;
                        const sel: StructureSelection = StructureQuery.run(query, currentLoci.structure);
                        const surroundingsLoci: Loci = StructureSelection.toLociWithSourceUnits(sel);
                        this.plugin.getPlugin().managers.structure.selection.fromLoci('add', surroundingsLoci);
                        const surroundingsLoc = StructureElement.Location.create(surroundingsLoci.structure);
                        for (const e of surroundingsLoci.elements) {
                            StructureElement.Location.set(surroundingsLoc, surroundingsLoci.structure, e.unit, e.unit.elements[0]);
                            if(SP.entity.type(surroundingsLoc) === 'polymer'){
                                const currentAsymId: string = SP.chain.label_asym_id(surroundingsLoc);
                                this.selection.setLastSelection('select', {
                                    modelId: currentModelId,
                                    labelAsymId: currentAsymId,
                                    regions: []
                                });
                            }
                        }
                        this.innerSelectionFlag = false;
                    }else if( SP.entity.type(loc) === 'polymer' ) {
                        const currentAsymId: string = SP.chain.label_asym_id(loc);
                        this.selection.setLastSelection('select', {
                            modelId: currentModelId,
                            labelAsymId: currentAsymId,
                            regions: []
                        });
                    }else{
                        this.selection.setLastSelection('select', null);
                    }
            }else{
                this.selection.setLastSelection('select', null);
            }
            const sequenceData: Array<ResidueSelectionInterface> = new Array<ResidueSelectionInterface>();
            for(const structure of this.plugin.getPlugin().managers.structure.hierarchy.current.structures){
                const data: Structure | undefined = structure.cell.obj?.data;
                if(data == null) return;
                const loci: Loci = this.plugin.getPlugin().managers.structure.selection.getLoci(data);
                if(StructureElement.Loci.is(loci)){
                    const loc = StructureElement.Location.create(loci.structure);
                    for (const e of loci.elements) {
                        StructureElement.Location.set(loc, loci.structure, e.unit, e.unit.elements[0]);
                        const seqIds = new Set<number>();
                        for (let i = 0, il = OrderedSet.size(e.indices); i < il; ++i) {
                            loc.element = e.unit.elements[OrderedSet.getAt(e.indices, i)];
                            seqIds.add(SP.residue.label_seq_id(loc));
                        }
                        sequenceData.push({
                            modelId: this.getModelId(data.model.id),
                            labelAsymId: SP.chain.label_asym_id(loc),
                            seqIds
                        });
                    }

                }
            }
            this.selection.setSelectionFromResidueSelection(sequenceData, 'select', 'structure');
            g();
        });
    }

    public pluginCall(f: (plugin: PluginContext) => void){
        this.plugin.pluginCall(f);
    }

    public setModelChangeCallback(f:(modelMap:SaguaroPluginModelMapType)=>void){
        this.modelChangeCallback = f;
        this.modelChangeCallbackSubs = this.plugin.getPlugin().state.events.object.updated.subscribe((o)=>{
            if(this.loadingFlag)
                return;
            if(o.obj.type.name === "Behavior" && o.action === "in-place") {
                f(this.getChains());
            }else if(o.obj.type.name === "Model" && o.action === "in-place"){
                f(this.getChains());
            }
        });
    }

    private getChains(): SaguaroPluginModelMapType{
        const structureRefList = getStructureOptions(this.plugin.getPlugin());
        const out: SaguaroPluginModelMapType = new Map<string, {entryId: string; chains: Array<{label:string;auth:string;entityId:string;title:string;type:ChainType;}>}>();
        structureRefList.forEach((structureRef,i)=>{
            const structure = getStructure(structureRef[0], this.plugin.getPlugin().state.data);
            let modelEntityId = getModelEntityOptions(structure)[0][0];
            const chains: [{modelId:string;entryId:string},{auth:string;label:string;entityId:string;title:string;type:ChainType;}[]] = getChainValues(structure, modelEntityId);
            out.set(this.getModelId(chains[0].modelId),{entryId:chains[0].entryId, chains: chains[1]});
        });
        return out;
    }

    private mapModels(loadParams: LoadParams | Array<LoadParams>): void{
        const loadParamList: Array<LoadParams> = loadParams instanceof Array ? loadParams : [loadParams];
        const structureRefList = getStructureOptions(this.plugin.getPlugin());
        structureRefList.forEach((structureRef,i)=>{
            const structure = getStructure(structureRef[0], this.plugin.getPlugin().state.data);
            let modelEntityId = getModelEntityOptions(structure)[0][0];
            const chains: [{modelId:string, entryId:string},{auth:string,label:string;entityId:string;title:string;type:ChainType;}[]] = getChainValues(structure, modelEntityId);
            this.modelMap.set(chains[0].modelId,loadParamList[i].id);
            if(loadParamList[i].id!=null)
                this.modelMap.set(loadParamList[i].id!,chains[0].modelId);
        });
    }

    private getModelId(id: string): string{
        return this.modelMap.get(id) ?? id;
    }

    public unsetCallbacks(): void {
        this.selectCallbackSubs?.unsubscribe();
        this.modelChangeCallbackSubs?.unsubscribe();
    }

    public resetCamera(): void {
        this.plugin.getPlugin().managers.camera.reset();
    }

}

type ChainType = "polymer"|"water"|"branched"|"non-polymer"|"macrolide";

function getStructureOptions(plugin: PluginContext): [string,string][] {
    const options: [string, string][] = [];
    plugin.managers.structure.hierarchy.current.structures.forEach(s=>{
        options.push([s.cell.transform.ref, s.cell.obj!.data.label]);
    })
    return options;
}

function getChainValues(structure: Structure, modelEntityId: string): [{modelId:string, entryId:string},{auth:string;label:string;entityId:string;title:string;type:ChainType;}[]] {
    const options: {auth:string;label:string;entityId:string;title:string;type:ChainType;}[] = [];
    const l = StructureElement.Location.create(structure);
    const seen = new Set<number>();
    const [modelIdx, entityId] = splitModelEntityId(modelEntityId);

    for (const unit of structure.units) {
        StructureElement.Location.set(l, structure, unit, unit.elements[0]);
        if (structure.getModelIndex(unit.model) !== modelIdx) continue;

        const id = unit.chainGroupId;
        if(seen.has(id)) continue;

        options.push({label:SP.chain.label_asym_id(l), auth:SP.chain.auth_asym_id(l), entityId: SP.entity.id(l), title: SP.entity.pdbx_description(l).join("|"), type: SP.entity.type(l)});
        seen.add(id);
    }
    const id: {modelId:string, entryId:string} = {modelId:l.unit?.model?.id, entryId: l.unit?.model?.entryId};
    return [id,options];
}

function getStructureWithModelId(structures: StructureRef[], modelId: string): Structure|undefined{
    for(const structure of structures){
        if(!structure.cell?.obj?.data?.units)
            continue;
        const unit =  structure.cell.obj.data.units[0];
        const id:string = unit.model.id;
        if(id === modelId)
            return structure.cell.obj.data
    }
}

function getStructure(ref: string, state: State) {
    const cell = state.select(ref)[0];
    if (!ref || !cell || !cell.obj) return Structure.Empty;
    return (cell.obj as PSO.Molecule.Structure).data;
}

function getModelEntityOptions(structure: Structure):[string, string][] {
    const options: [string, string][] = [];
    const l = StructureElement.Location.create(structure);
    const seen = new Set<string>();
    for (const unit of structure.units) {
        StructureElement.Location.set(l, structure, unit, unit.elements[0]);
        const id = SP.entity.id(l);
        const modelIdx = structure.getModelIndex(unit.model);
        const key = `${modelIdx}|${id}`;
        if (seen.has(key)) continue;
        let description = SP.entity.pdbx_description(l).join(', ');
        if (structure.models.length) {
            if (structure.representativeModel) { // indicates model trajectory
                description += ` (Model ${structure.models[modelIdx].modelNum})`;
            } else  if (description.startsWith('Polymer ')) { // indicates generic entity name
                description += ` (${structure.models[modelIdx].entry})`;
            }
        }
        const label = `${id}: ${description}`;
        options.push([ key, label ]);
        seen.add(key);
    }
    if (options.length === 0) options.push(['', 'No entities']);
    return options;
}

function splitModelEntityId(modelEntityId: string) {
    const [ modelIdx, entityId ] = modelEntityId.split('|');
    return [ parseInt(modelIdx), entityId ];
}