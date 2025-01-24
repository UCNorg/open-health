// TODO typesafe the form data
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import {Document, Page, pdfjs} from 'react-pdf';
import React, {ChangeEvent, useEffect, useMemo, useState} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Activity, FileText, Loader2, Plus, Trash2, User} from 'lucide-react';
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,} from "@/components/ui/dialog";
import useSWR from "swr";
import {HealthData, HealthDataCreateResponse, HealthDataListResponse} from "@/app/api/health-data/route";
import DynamicForm from '../form/dynamic-form';
import JSONEditor from '../form/json-editor';
import cuid from "cuid";
import {cn} from "@/lib/utils";
import Image from "next/image";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface SymptomsData {
    date: string;
    description: string;
}

interface Field {
    key: string;
    label?: string;
    type: string;
    fields?: Field[];
    options?: { value: string; label: string }[];
    defaultValue?: string;
    placeholder?: string;
}

interface AddSourceDialogProps {
    onFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
    onAddSymptoms: (date: string) => void;
}

interface HealthDataItemProps {
    healthData: HealthData;
    isSelected: boolean;
    onClick: () => void;
    onDelete: (id: string) => void;
}

interface HealthDataPreviewProps {
    healthData: HealthData;
    formData: Record<string, any>;
    setFormData: (data: Record<string, any>) => void;
}

const HealthDataType = {
    FILE: {
        id: 'FILE',
        name: 'File'
    },
    PERSONAL_INFO: {
        id: 'PERSONAL_INFO',
        name: 'Personal Info'
    },
    SYMPTOMS: {
        id: 'SYMPTOMS',
        name: 'Symptoms'
    }
};

const personalInfoFields: Field[] = [
    {key: 'name', label: 'Name', type: 'text'},
    {key: 'birthDate', label: 'Birth Date', type: 'date'},
    {
        key: 'height',
        label: 'Height',
        type: 'compound',
        fields: [
            {key: 'value', type: 'number', placeholder: 'Height'},
            {
                key: 'unit',
                type: 'select',
                options: [
                    {value: 'cm', label: 'cm'},
                    {value: 'ft', label: 'ft'}
                ],
                defaultValue: 'cm'
            }
        ]
    },
    {
        key: 'weight',
        label: 'Weight',
        type: 'compound',
        fields: [
            {key: 'value', type: 'number', placeholder: 'Weight'},
            {
                key: 'unit',
                type: 'select',
                options: [
                    {value: 'kg', label: 'kg'},
                    {value: 'lbs', label: 'lbs'}
                ],
                defaultValue: 'kg'
            }
        ]
    },
    {
        key: 'bloodType',
        label: 'Blood Type',
        type: 'select',
        options: [
            {value: 'A+', label: 'A+'},
            {value: 'A-', label: 'A-'},
            {value: 'B+', label: 'B+'},
            {value: 'B-', label: 'B-'},
            {value: 'O+', label: 'O+'},
            {value: 'O-', label: 'O-'},
            {value: 'AB+', label: 'AB+'},
            {value: 'AB-', label: 'AB-'}
        ]
    },
    {key: 'familyHistory', label: 'Family History', type: 'textarea'}
];

const symptomsFields: Field[] = [
    {key: 'date', label: 'Date', type: 'date'},
    {key: 'description', label: 'Description', type: 'textarea'}
];


const AddSourceDialog: React.FC<AddSourceDialogProps> = ({onFileUpload, onAddSymptoms}) => {
    const [open, setOpen] = useState(false);

    const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
        onFileUpload(e);
        setOpen(false);
    };

    const handleAddSymptoms = () => {
        const today = new Date().toISOString().split('T')[0];
        onAddSymptoms(today);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full flex gap-2 items-center">
                    <Plus className="w-4 h-4"/>
                    Add Source
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add New Source</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 min-w-[300px]">
                    <label
                        htmlFor="file-upload"
                        className="flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                        <FileText className="w-6 h-6 text-gray-500"/>
                        <div className="flex-1">
                            <h3 className="font-medium">Upload Files</h3>
                            <p className="text-sm text-gray-500">Add images or PDF files</p>
                        </div>
                    </label>
                    <input
                        type="file"
                        id="file-upload"
                        multiple
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={handleFileUpload}
                    />

                    <button
                        className="flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 w-full"
                        onClick={handleAddSymptoms}
                    >
                        <Activity className="w-6 h-6 text-gray-500"/>
                        <div className="flex-1 text-left">
                            <h3 className="font-medium">New Symptoms</h3>
                            <p className="text-sm text-gray-500">Record today&#39;s symptoms</p>
                        </div>
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const HealthDataItem: React.FC<HealthDataItemProps> = ({healthData, isSelected, onClick, onDelete}) => {
    const getIcon = (type: string) => {
        switch (type) {
            case HealthDataType.FILE.id:
                return <FileText className="h-5 w-5"/>;
            case HealthDataType.PERSONAL_INFO.id:
                return <User className="h-5 w-5"/>;
            case HealthDataType.SYMPTOMS.id:
                return <Activity className="h-5 w-5"/>;
            default:
                return <FileText className="h-5 w-5"/>;
        }
    };

    const getName = (type: string) => {
        if (type === HealthDataType.SYMPTOMS.id && healthData.data) {
            const data = healthData.data as unknown as SymptomsData;
            return `${HealthDataType.SYMPTOMS.name} (${data.date})`;
        }
        return Object.values(HealthDataType)
            .find((t) => t.id === type)?.name || '';
    };

    return (
        <div
            className={`flex items-center justify-between p-2 rounded cursor-pointer transition-all
${isSelected
                ? 'text-primary text-base font-semibold bg-primary/5'
                : 'text-sm hover:bg-gray-50'}`}
            onClick={onClick}
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex-shrink-0">
                    {getIcon(healthData.type)}
                </div>
                <span className="truncate">{getName(healthData.type)}</span>
            </div>
            {(healthData.type === HealthDataType.FILE.id || healthData.type === HealthDataType.SYMPTOMS.id) && (
                healthData.status === 'PARSING' ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled
                    >
                        <Loader2 className="h-5 w-5 animate-spin"/>
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(healthData.id);
                        }}
                    >
                        <Trash2 className="h-5 w-5"/>
                    </Button>
                )
            )}
        </div>
    );
};

const HealthDataPreview = ({healthData, formData, setFormData}: HealthDataPreviewProps) => {
    const [numPages, setNumPages] = useState(0);

    const getFields = (): Field[] => {
        switch (healthData.type) {
            case HealthDataType.PERSONAL_INFO.id:
                return personalInfoFields;
            case HealthDataType.SYMPTOMS.id:
                return symptomsFields;
            default:
                return [];
        }
    };

    const handleFormChange = (key: string, value: any) => {
        const newData = {...formData, [key]: value};
        setFormData(newData);
    };

    const handleJSONSave = (newData: Record<string, any>) => {
        setFormData(newData);
    };

    const onDocumentLoadSuccess = async ({numPages}: pdfjs.PDFDocumentProxy) => {
        setNumPages(numPages);
    }

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="h-[40%] min-h-[300px]">
                <div className="bg-white h-full overflow-y-auto">
                    {(healthData.type === HealthDataType.PERSONAL_INFO.id || healthData.type === HealthDataType.SYMPTOMS.id) ? (
                        <DynamicForm
                            fields={getFields()}
                            data={formData}
                            onChange={handleFormChange}
                        />
                    ) : healthData.type === HealthDataType.FILE.id ? (
                        healthData.fileType?.includes('image') && healthData.filePath ? (
                            <Image
                                src={healthData.filePath}
                                alt="Preview"
                                className="max-w-full h-auto"
                                unoptimized
                            />
                        ) : (
                            <div className="bg-gray-100 p-4 rounded">
                                <Document file={healthData.filePath}
                                          className="w-full"
                                          onLoadSuccess={onDocumentLoadSuccess}>
                                    {Array.from(new Array(numPages), (_, index) => {
                                        return (
                                            <Page
                                                className={cn('w-full')}
                                                key={`page_${index + 1}`}
                                                pageNumber={index + 1}
                                                renderAnnotationLayer={false}
                                                renderTextLayer={false}
                                            />
                                        );
                                    })}
                                </Document>
                            </div>
                        )
                    ) : null}
                </div>
            </div>

            <div className="flex-1">
                <div className="bg-white p-4 rounded-lg border h-full">
                    <JSONEditor
                        data={formData}
                        onSave={handleJSONSave}
                        isEditable={healthData.type === HealthDataType.FILE.id && healthData.status === 'COMPLETED'}
                    />
                </div>
            </div>
        </div>
    );
};

export default function SourceAddScreen() {
    const [selectedHealthData, setSelectedHealthData] = useState<HealthData>();
    const [formData, setFormData] = useState<Record<string, any>>({});

    const {data, mutate: healthDataMutate} = useSWR<HealthDataListResponse>('/api/health-data', async (url: string) => {
        const response = await fetch(url);
        return await response.json();
    });
    const healthDataList = useMemo(() => data?.healthDataList || [], [data]);

    useEffect(() => {
        if (healthDataList.length > 0 && selectedHealthData === undefined) {
            setSelectedHealthData(healthDataList[0]);
            setFormData(JSON.parse(JSON.stringify(healthDataList[0].data)));
        }
    }, [healthDataList, selectedHealthData]);

    const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const body = {
            id: cuid(),
            type: HealthDataType.FILE.id,
            data: {},
            status: 'PARSING',
            filePath: null,
            fileType: null,
            createdAt: new Date(),
            updatedAt: new Date()
        }

        const formData = new FormData();
        if (files.length > 0) formData.append('file', files[0]);
        formData.append('id', body.id);
        formData.append('type', body.type);
        formData.append('data', JSON.stringify(body.data));

        // Optimistic update
        const oldHealthDataList = [...healthDataList];
        await healthDataMutate({healthDataList: [...oldHealthDataList, body]}, {revalidate: false});
        setSelectedHealthData({...body});
        setFormData({...body.data});

        // Send request
        const response = await fetch(`/api/health-data`, {method: 'POST', body: formData})
        const newSource: HealthDataCreateResponse = await response.json();
        setSelectedHealthData(newSource);
        setFormData(JSON.parse(JSON.stringify(newSource.data)));
        await healthDataMutate({healthDataList: [...oldHealthDataList, newSource]});
    };

    const handleAddSymptoms = async (date: string) => {
        const now = new Date();
        const body = {
            id: cuid(),
            type: HealthDataType.SYMPTOMS.id,
            data: {
                date,
                description: ''
            }
        };

        try {
            const response = await fetch(`/api/health-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response:', errorText || 'Empty response');
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            let newSource;
            try {
                newSource = text ? JSON.parse(text) : {
                    ...body,
                    name: `Symptoms (${date})`,
                    status: 'ACTIVE',
                    createdAt: now,
                    updatedAt: now
                };
            } catch (e) {
                console.error('Failed to parse response:', e);
                newSource = {
                    ...body,
                    name: `Symptoms (${date})`,
                    status: 'ACTIVE',
                    createdAt: now,
                    updatedAt: now
                };
            }

            setSelectedHealthData(newSource);
            setFormData(body.data);
            await healthDataMutate({healthDataList: [...healthDataList, newSource]});
        } catch (error) {
            console.error('Failed to add symptoms:', error);
            // Add the data anyway for better UX
            const fallbackSource = {
                ...body,
                name: `Symptoms (${date})`,
                status: 'ACTIVE',
                createdAt: now,
                updatedAt: now
            };
            setSelectedHealthData(fallbackSource);
            setFormData(body.data);
            await healthDataMutate({healthDataList: [...healthDataList, fallbackSource]});
        }
    };

    const handleDeleteSource = async (id: string) => {
        await fetch(`/api/health-data/${id}`, {method: 'DELETE'});

        const newSources = healthDataList.filter(s => s.id !== id);
        await healthDataMutate({healthDataList: newSources});

        if (selectedHealthData?.id === id) {
            if (newSources.length > 0) {
                setSelectedHealthData(newSources[0]);
                setFormData(JSON.parse(JSON.stringify(newSources[0].data)));
            } else {
                setSelectedHealthData(undefined);
                setFormData({})
            }
        }
    };

    const onChangeFormData = async (data: Record<string, any>) => {
        if (selectedHealthData) {
            setFormData(data);
            await fetch(`/api/health-data/${selectedHealthData.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({data: data})
            });
            await healthDataMutate({
                healthDataList: healthDataList.map(s =>
                    s.id === selectedHealthData.id
                        ? {...s, data: data}
                        : s
                )
            });
        }
    }

    return (
        <div className="w-full h-screen flex gap-4 p-4">
            <div className="w-1/3 max-w-[500px] h-full">
                <Card className="h-full flex flex-col">
                    <CardHeader className="flex-shrink-0">
                        <CardTitle>Sources</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto space-y-4">
                        <AddSourceDialog
                            onFileUpload={handleFileUpload}
                            onAddSymptoms={handleAddSymptoms}
                        />

                        <div className="space-y-2">
                            {healthDataList.map((healthData) => (
                                <HealthDataItem
                                    key={healthData.id}
                                    healthData={healthData}
                                    isSelected={selectedHealthData?.id === healthData.id}
                                    onClick={() => {
                                        setSelectedHealthData(healthData);
                                        setFormData(JSON.parse(JSON.stringify(healthData.data)));
                                    }}
                                    onDelete={handleDeleteSource}
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="w-2/3 flex-1 h-full">
                <Card className="h-full flex flex-col">
                    <CardHeader className="flex-shrink-0">
                        <CardTitle>{selectedHealthData?.name || 'Select a source'}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto">
                        {selectedHealthData ? (
                            <HealthDataPreview
                                key={selectedHealthData.id}
                                healthData={selectedHealthData}
                                formData={formData}
                                setFormData={onChangeFormData}
                            />
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-500">
                                Select a source from the list
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
;
